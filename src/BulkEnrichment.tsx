import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, LoaderCircle, Play, Rows3, UploadCloud } from 'lucide-react';

interface SourceRow {
  index: number;
  values: Record<string, string>;
}

interface BatchResult {
  row: SourceRow;
  url: string;
  status: 'success' | 'error';
  company?: string;
  sector?: string;
  description?: string;
  requestId?: string;
  error?: string;
}

interface BulkEnrichmentProps {
  providerConfigured: boolean;
}

const URL_HEADER_HINTS = ['url', 'website', 'site', 'dominio', 'domain', 'link', 'homepage', 'pagina'];
const NAME_HEADER_HINTS = ['empresa', 'company', 'companyname', 'nome', 'razao', 'razaosocial', 'account'];

function normalizedHeader(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findHeader(headers: string[], hints: string[]) {
  return headers.find((header) => hints.some((hint) => normalizedHeader(header).includes(hint))) ?? '';
}

function normalizeUrl(value: string) {
  const clean = value.trim();
  if (!clean) return '';
  const candidate = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
  try {
    const parsed = new URL(candidate);
    return parsed.hostname.includes('.') ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export default function BulkEnrichment({ providerConfigured }: BulkEnrichmentProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [urlColumn, setUrlColumn] = useState('');
  const [nameColumn, setNameColumn] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [results, setResults] = useState<BatchResult[]>([]);
  const [error, setError] = useState('');

  const eligibleRows = useMemo(() => rows.filter((row) => Boolean(normalizeUrl(row.values[urlColumn] ?? ''))), [rows, urlColumn]);
  const invalidRows = rows.length - eligibleRows.length;
  const successCount = results.filter((result) => result.status === 'success').length;
  const progress = eligibleRows.length ? Math.round((completed / eligibleRows.length) * 100) : 0;

  const parseFile = async (file: File) => {
    setLoadingFile(true); setError(''); setResults([]); setCompleted(0);
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error('A planilha não possui uma aba legível.');
      const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '', raw: false });
      if (!records.length) throw new Error('O arquivo não possui linhas de dados.');
      const normalizedRows = records.map((record, index) => ({ index: index + 2, values: Object.fromEntries(Object.entries(record).map(([key, value]) => [key, String(value ?? '').trim()])) }));
      const nextHeaders = Array.from(new Set(normalizedRows.flatMap((row) => Object.keys(row.values))));
      setFileName(file.name); setHeaders(nextHeaders); setRows(normalizedRows); setUrlColumn(findHeader(nextHeaders, URL_HEADER_HINTS)); setNameColumn(findHeader(nextHeaders, NAME_HEADER_HINTS));
    } catch (issue) {
      setRows([]); setHeaders([]); setUrlColumn(''); setNameColumn(''); setError(issue instanceof Error ? issue.message : 'Não foi possível ler o arquivo.');
    } finally { setLoadingFile(false); }
  };

  const startBatch = async () => {
    if (!providerConfigured || !eligibleRows.length || running) return;
    setRunning(true); setError(''); setResults([]); setCompleted(0);
    const pending = [...eligibleRows];
    const output: BatchResult[] = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const row = pending[cursor++];
        const url = normalizeUrl(row.values[urlColumn] ?? '');
        try {
          const response = await fetch('/api/integrations/scrapegraph/enrich', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error ?? 'Falha no provedor');
          const data = payload.extraction?.data ?? {};
          output.push({ row, url, status: 'success', company: typeof data.companyName === 'string' ? data.companyName : row.values[nameColumn] || 'Não identificado', sector: typeof data.sector === 'string' ? data.sector : '', description: typeof data.description === 'string' ? data.description : '', requestId: payload.extraction?.requestId });
        } catch (issue) {
          output.push({ row, url, status: 'error', error: issue instanceof Error ? issue.message : 'Falha no enriquecimento' });
        } finally { setCompleted((current) => current + 1); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, pending.length) }, () => worker()));
    output.sort((left, right) => left.row.index - right.row.index);
    setResults(output); setRunning(false);
  };

  const exportResults = () => {
    if (!results.length) return;
    const lines = [
      ['linha', 'url', 'status', 'empresa', 'setor', 'descricao', 'request_id', 'erro'].map(csvCell).join(','),
      ...results.map((result) => [result.row.index, result.url, result.status, result.company, result.sector, result.description, result.requestId, result.error].map(csvCell).join(',')),
    ];
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `prospectra-enriquecimento-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href);
  };

  return <section className="bulk-enrichment">
    <div className="bulk-upload-card">
      <div className="bulk-upload-icon"><FileSpreadsheet size={24}/></div>
      <div className="bulk-upload-copy"><span className="eyebrow">ENRIQUECIMENTO EM LOTE</span><h2>Importe uma lista de empresas</h2><p>Envie CSV, XLSX ou XLS. Cada linha elegível gera uma extração real no ScrapeGraphAI e retorna com status, empresa, setor e request ID.</p></div>
      <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={(event) => { const file = event.target.files?.[0]; if (file) void parseFile(file); }} />
      <button className="outline-button" onClick={() => inputRef.current?.click()} disabled={loadingFile}><UploadCloud size={16}/>{loadingFile ? 'Lendo arquivo…' : 'Escolher CSV ou Excel'}</button>
    </div>
    {error && <div className="bulk-error"><AlertTriangle size={16}/><span>{error}</span></div>}
    {rows.length > 0 && <>
      <div className="bulk-config panel"><div className="bulk-file-summary"><Rows3 size={17}/><div><strong>{fileName}</strong><span>{rows.length} linhas · {eligibleRows.length} elegíveis · {invalidRows} sem URL válida</span></div></div><div className="bulk-selects"><label>Coluna de URL/domínio<select value={urlColumn} onChange={(event) => setUrlColumn(event.target.value)}>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label><label>Coluna de empresa <span>(opcional)</span><select value={nameColumn} onChange={(event) => setNameColumn(event.target.value)}><option value="">Não usar</option>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label></div><div className="bulk-actions"><div><strong>{providerConfigured ? 'ScrapeGraphAI v2 pronto' : 'Chave SGAI pendente'}</strong><span>{providerConfigured ? 'A execução usa 3 requisições concorrentes para preservar a estabilidade.' : 'Configure SGAI_API_KEY no Production antes de executar.'}</span></div><button className="new-button" onClick={() => void startBatch()} disabled={!providerConfigured || !eligibleRows.length || running}>{running ? <><LoaderCircle className="spin" size={16}/> Enriquecendo {completed}/{eligibleRows.length}</> : <><Play size={16}/> Enriquecer lista</>}</button></div>{running && <div className="bulk-progress"><span style={{ width: `${progress}%` }}></span></div>}</div>
      {results.length > 0 && <div className="panel bulk-results"><div className="panel-head"><div><span className="eyebrow">RESULTADO DO LOTE</span><h2>{successCount} de {results.length} empresas enriquecidas</h2></div><button className="outline-button" onClick={exportResults}><Download size={15}/> Exportar CSV</button></div><div className="bulk-result-table"><div className="bulk-result-head"><span>Linha</span><span>Empresa</span><span>Setor</span><span>Status</span><span>Origem</span></div>{results.map((result) => <div className="bulk-result-row" key={`${result.row.index}-${result.url}`}><span>#{result.row.index}</span><div><strong>{result.company || result.row.values[nameColumn] || 'Não identificado'}</strong><small>{result.url}</small></div><span>{result.sector || '—'}</span><span className={`bulk-status ${result.status}`}>{result.status === 'success' ? <><CheckCircle2 size={13}/> Concluído</> : <><AlertTriangle size={13}/> Falhou</>}</span><span className="bulk-request">{result.requestId ? `req ${result.requestId.slice(0, 8)}` : result.error || '—'}</span></div>)}</div></div>}
    </>}
  </section>;
}
