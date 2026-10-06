import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, LoaderCircle, Play, Rows3, UploadCloud } from 'lucide-react';
import type { CompanyExtraction } from './enrichment-model';

export interface BulkSourceRow { index: number; values: Record<string, string> }
export interface BatchAppliedResult { row: BulkSourceRow; extraction: CompanyExtraction }
interface BatchResult {
  row: BulkSourceRow;
  url: string;
  status: 'success' | 'error';
  extraction?: CompanyExtraction;
  error?: string;
}
interface BulkEnrichmentProps {
  providerConfigured: boolean;
  writable: boolean;
  onImportRows: (rows: BulkSourceRow[]) => void;
  onApplyBatch: (results: BatchAppliedResult[]) => void;
}
const URL_HEADER_HINTS = ['url', 'website', 'site', 'dominio', 'domain', 'link', 'homepage', 'pagina'];
const NAME_HEADER_HINTS = ['empresa', 'company', 'companyname', 'nome', 'razao', 'razaosocial', 'account'];
function normalizedHeader(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function findHeader(headers: string[], hints: string[]) { return headers.find((header) => hints.includes(normalizedHeader(header))) ?? headers.find((header) => hints.some((hint) => normalizedHeader(header).includes(hint))) ?? ''; }
function normalizeUrl(value: string) {
  const clean = value.trim(); if (!clean) return '';
  try { const parsed = new URL(/^https?:\/\//i.test(clean) ? clean : `https://${clean}`); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password && parsed.hostname.includes('.') ? parsed.toString() : ''; }
  catch { return ''; }
}
function csvCell(value: unknown) {
  const raw = String(value ?? '');
  return `"${(/^[\s]*[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw).replace(/"/g, '""')}"`;
}
export default function BulkEnrichment({ providerConfigured, writable, onImportRows, onApplyBatch }: BulkEnrichmentProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<BulkSourceRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [urlColumn, setUrlColumn] = useState('');
  const [nameColumn, setNameColumn] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [results, setResults] = useState<BatchResult[]>([]);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'import' | 'scrape'>('import');
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [saved, setSaved] = useState(false);
  const eligibleRows = useMemo(() => rows.filter((row) => Boolean(normalizeUrl(row.values[urlColumn] ?? ''))), [rows, urlColumn]);
  const importableRows = useMemo(() => rows.filter((row) => Boolean(normalizeUrl(row.values[urlColumn] ?? '') || row.values[nameColumn]?.trim())), [rows, urlColumn, nameColumn]);
  const toResearch = eligibleRows.filter((row) => selectedRows.includes(row.index)).slice(0, 20);
  const success = results.filter((result) => result.status === 'success' && result.extraction);
  const progress = toResearch.length ? Math.round(completed / toResearch.length * 100) : 0;
  const parseFile = async (file: File) => {
    setLoadingFile(true); setError(''); setResults([]); setSelectedRows([]); setSaved(false); setCompleted(0);
    try {
      if (file.size > 5_000_000) throw new Error('Arquivo acima de 5 MB. Divida a base antes de importar.');
      if (!/\.(csv|xlsx|xls)$/i.test(file.name)) throw new Error('Use CSV, XLSX ou XLS.');
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error('A planilha não possui uma aba legível.');
      const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
      if (!records.length) throw new Error('O arquivo não possui linhas de dados.');
      if (records.length > 1000) throw new Error('Importe até 1.000 linhas por arquivo para preservar o workspace.');
      const parsed = records.map((record, index) => ({ index: index + 2, values: Object.fromEntries(Object.entries(record).map(([key, value]) => [key, String(value ?? '').trim()])) }));
      const nextHeaders = Array.from(new Set(parsed.flatMap((row) => Object.keys(row.values))));
      setFileName(file.name); setHeaders(nextHeaders); setRows(parsed); setUrlColumn(findHeader(nextHeaders, URL_HEADER_HINTS)); setNameColumn(findHeader(nextHeaders, NAME_HEADER_HINTS));
    } catch (issue) { setRows([]); setError(issue instanceof Error ? issue.message : 'Não foi possível ler o arquivo.'); }
    finally { setLoadingFile(false); }
  };
  const importReadyData = () => {
    if (!writable || !importableRows.length || running) return;
    const mappedRows = importableRows.map((row) => ({ ...row, values: { 'Empresa selecionada': row.values[nameColumn] || '', 'URL selecionada': row.values[urlColumn] || '', ...row.values } }));
    onImportRows(mappedRows); setResults(importableRows.map((row) => ({ row, url: normalizeUrl(row.values[urlColumn] ?? ''), status: 'success' }))); setSaved(true);
  };
  const startBatch = async () => {
    if (!providerConfigured || !writable || !toResearch.length || running) return;
    setRunning(true); setError(''); setResults([]); setSaved(false); setCompleted(0);
    const output: BatchResult[] = []; let cursor = 0;
    const worker = async () => {
      while (cursor < toResearch.length) {
        const row = toResearch[cursor++]; const url = normalizeUrl(row.values[urlColumn] ?? '');
        try {
          const response = await fetch('/api/integrations/scrapegraph/enrich', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(response.status === 402 ? 'Sem créditos' : `${String(payload.error || 'Falha no provedor')} · HTTP ${response.status}`);
          const extraction = payload.extraction as CompanyExtraction;
          if (!extraction || !Array.isArray(extraction.contacts)) throw new Error('Resultado incompleto');
          output.push({ row, url, status: 'success', extraction });
        } catch (issue) { output.push({ row, url, status: 'error', error: issue instanceof Error ? issue.message : 'Falha no enriquecimento' }); }
        finally { setCompleted((current) => current + 1); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, toResearch.length) }, () => worker()));
    output.sort((a, b) => a.row.index - b.row.index); setResults(output); setRunning(false);
  };
  const exportResults = () => {
    if (!results.length) return;
    const lines = [
      ['linha', 'url', 'status', 'empresa', 'setor', 'descricao', 'pessoas', 'telefones_publicos', 'perfis_linkedin_publicos', 'request_id', 'erro'].map(csvCell).join(','),
      ...results.map((result) => {
        const data = result.extraction?.data ?? {};
        return [result.row.index, result.url, result.status, data.companyName || result.row.values[nameColumn], data.sector, data.description, result.extraction?.contacts.map((c) => c.name).join('; '), result.extraction?.contacts.map((c) => c.phone).filter(Boolean).join('; '), result.extraction?.contacts.map((c) => c.linkedin).filter(Boolean).join('; '), result.extraction?.requestId, result.error].map(csvCell).join(',');
      }),
    ];
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `prospectra-enriquecimento-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href);
  };
  return <section className="bulk-enrichment">
    <div className="bulk-upload-card"><div className="bulk-upload-icon"><FileSpreadsheet size={24}/></div><div className="bulk-upload-copy"><span className="eyebrow">BASE + PESQUISA SELETIVA</span><h2>Importe empresas, contatos e telefones de uma planilha</h2><p>CSV/XLSX é gratuito por padrão. Pesquise somente linhas selecionadas e revise antes de incorporar os resultados ao CRM.</p></div><input ref={inputRef} type="file" accept=".csv,.xlsx,.xls,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void parseFile(file); }} /><button className="outline-button" onClick={() => inputRef.current?.click()} disabled={loadingFile}><UploadCloud size={16}/>{loadingFile ? 'Lendo…' : 'Escolher CSV ou Excel'}</button></div>
    {error && <div className="bulk-error"><AlertTriangle size={16}/>{error}</div>}
    {rows.length > 0 && <><div className="bulk-config panel"><div className="bulk-file-summary"><Rows3 size={17}/><div><strong>{fileName}</strong><span>{rows.length} linhas · {importableRows.length} importáveis · {eligibleRows.length} com URL válida</span></div></div><div className="bulk-selects"><label>Coluna URL/domínio<select value={urlColumn} onChange={(event) => { setUrlColumn(event.target.value); setSelectedRows([]); setResults([]); setSaved(false); }}><option value="">Não usar</option>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label><label>Coluna empresa<select value={nameColumn} onChange={(event) => setNameColumn(event.target.value)}><option value="">Não usar</option>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label></div><div className="bulk-mode-switch"><button className={mode === 'import' ? 'active' : ''} type="button" onClick={() => { setMode('import'); setResults([]); setSaved(false); }}><FileSpreadsheet size={15}/> Importar dados prontos · R$ 0</button><button className={mode === 'scrape' ? 'active' : ''} type="button" onClick={() => { setMode('scrape'); setResults([]); setSaved(false); }}><Play size={15}/> Pesquisar linhas selecionadas</button></div>
      {mode === 'scrape' && <div className="bulk-select-rows"><div><button className="text-button" type="button" onClick={() => setSelectedRows(eligibleRows.slice(0, 20).map((row) => row.index))}>Selecionar até 20 URLs</button><button className="text-button" type="button" onClick={() => setSelectedRows([])}>Limpar seleção</button></div><div className="bulk-candidates">{eligibleRows.slice(0, 100).map((row) => <label key={row.index}><input type="checkbox" checked={selectedRows.includes(row.index)} disabled={!selectedRows.includes(row.index) && selectedRows.length >= 20} onChange={(event) => setSelectedRows((current) => event.target.checked ? [...current, row.index] : current.filter((index) => index !== row.index))}/><span>#{row.index} · {row.values[nameColumn] || normalizeUrl(row.values[urlColumn] ?? '')}</span></label>)}</div>{eligibleRows.length > 100 && <small>Mostrando as primeiras 100 URLs elegíveis. Divida o arquivo para selecionar outras.</small>}</div>}
      <div className="bulk-actions"><div><strong>{mode === 'import' ? 'Sem chamadas externas e sem gasto' : `${toResearch.length} URLs selecionadas · até ${toResearch.length * 5} créditos`}</strong><span>{mode === 'import' ? 'Empresa, cargo, e-mail, telefone e LinkedIn informados no arquivo serão importados como dados a revisar.' : 'A pesquisa utiliza até 2 chamadas simultâneas. Não compra contatos nem inventa perfis.'}</span></div><button className="new-button" disabled={!writable || running || (mode === 'scrape' ? !providerConfigured || !toResearch.length : !importableRows.length)} onClick={() => mode === 'import' ? importReadyData() : void startBatch()}>{running ? <><LoaderCircle className="spin" size={16}/>{completed}/{toResearch.length}</> : mode === 'import' ? <><UploadCloud size={16}/>Importar no CRM</> : <><Play size={16}/>Executar pesquisa paga</>}</button></div>{running && <div className="bulk-progress"><span style={{ width: `${progress}%` }}/></div>}
    </div>{results.length > 0 && <div className="panel bulk-results"><div className="panel-head"><div><span className="eyebrow">RESULTADO DO LOTE</span><h2>{success.length || (saved && mode === 'import' ? results.length : 0)} de {results.length} linhas concluídas</h2></div><button className="outline-button" onClick={exportResults}><Download size={15}/>Exportar CSV</button></div><div className="bulk-result-table"><div className="bulk-result-head"><span>Linha</span><span>Empresa</span><span>Setor</span><span>Status</span><span>Origem / erro</span></div>{results.map((result) => <div className="bulk-result-row" key={`${result.row.index}-${result.url}`}><span>#{result.row.index}</span><div><strong>{String(result.extraction?.data.companyName || result.row.values[nameColumn] || result.url || 'Não identificado')}</strong><small>{result.extraction?.contacts.length || 0} pessoa(s) · {result.url || 'sem URL'}</small></div><span>{String(result.extraction?.data.sector || '—')}</span><span className={`bulk-status ${result.status}`}>{result.status === 'success' ? <><CheckCircle2 size={13}/>Concluído</> : <><AlertTriangle size={13}/>Falhou</>}</span><span className="bulk-request">{result.extraction?.requestId ? `req ${result.extraction.requestId.slice(0, 8)}` : result.error || 'Arquivo importado'}</span></div>)}</div>{mode === 'scrape' && success.length > 0 && <div className="enrich-save"><span>{saved ? 'Resultados salvos no CRM como não verificados.' : 'Pesquisa concluída; ainda não foi salva no CRM. Revise a planilha exportada antes de adicionar.'}</span><button className="new-button" disabled={!writable || saved} onClick={() => { onApplyBatch(success.map(({ row, extraction }) => ({ row, extraction: extraction! }))); setSaved(true); }}>Adicionar {success.length} resultado(s) ao CRM</button></div>}</div>}</>}
  </section>;
}
