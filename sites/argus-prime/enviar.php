<?php
/**
 * Argus Prime — recebe o formulário de contato e envia por e-mail.
 *
 * Requisitos: PHP 7.4 ou superior, função mail() ativa (padrão na Hostinger).
 * Sem dependências. Não grava nada em disco.
 *
 * Para trocar o e-mail que recebe as mensagens, edite DESTINO.
 * Para trocar o remetente técnico, edite REMETENTE. Use um endereço do próprio
 * domínio (argusprime.com.br), para o e-mail não cair em spam.
 */

declare(strict_types=1);

const DESTINO        = 'contato@argusprime.com.br';
const REMETENTE      = 'no-reply@argusprime.com.br';
const NOME_REMETENTE = 'Site Argus Prime';

// Opções aceitas no campo "assunto" (devem ser iguais às do contato.html).
const ASSUNTOS = [
    'Diagnóstico tributário',
    'Engenharia financeira',
    'Compensação tributária',
    'Estratégia societária',
    'Outro',
];

// Limites de tamanho (em caracteres).
const MAX_NOME     = 120;
const MAX_EMPRESA  = 120;
const MAX_EMAIL    = 160;
const MAX_TELEFONE = 30;
const MAX_MENSAGEM = 3000;

date_default_timezone_set('America/Sao_Paulo');

/* ------------------------------------------------------------------ */
/* Funções de apoio                                                    */
/* ------------------------------------------------------------------ */

function quer_json(): bool
{
    return stripos((string) ($_SERVER['HTTP_ACCEPT'] ?? ''), 'application/json') !== false;
}

function pasta_base(): string
{
    $dir = str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/')));
    return rtrim($dir, '/');
}

/** Responde em JSON ou redireciona, conforme o cabeçalho Accept, e encerra. */
function responder(bool $ok, string $erro = '', int $status = 200): void
{
    if (quer_json()) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        $dados = $ok ? ['ok' => true] : ['ok' => false, 'erro' => $erro];
        echo json_encode($dados, JSON_UNESCAPED_UNICODE);
        exit;
    }
    header('Cache-Control: no-store');
    header('Location: ' . pasta_base() . '/contato.html?' . ($ok ? 'enviado=1' : 'erro=1'), true, 303);
    exit;
}

function tamanho(string $v): int
{
    return function_exists('mb_strlen') ? mb_strlen($v, 'UTF-8') : strlen($v);
}

function cortar(string $v, int $max): string
{
    if (function_exists('mb_substr')) {
        return mb_substr($v, 0, $max, 'UTF-8');
    }
    return substr($v, 0, $max);
}

/** Valor bruto do POST como texto; qualquer outra coisa (lista, vazio) vira null. */
function bruto(string $campo): ?string
{
    $v = $_POST[$campo] ?? null;
    return is_string($v) ? $v : null;
}

/**
 * Campo de uma linha só (vai para cabeçalho ou assunto).
 * Quebra de linha = tentativa de injeção de cabeçalho: o campo é recusado.
 */
function campo_linha(?string $v, int $max, bool &$invalido): string
{
    if ($v === null) {
        return '';
    }
    if (preg_match('/[\r\n]/', $v) === 1 || stripos($v, '%0a') !== false || stripos($v, '%0d') !== false) {
        $invalido = true;
        return '';
    }
    $limpo = preg_replace('/\p{C}+/u', '', $v);
    if ($limpo === null) { // UTF-8 inválido
        $invalido = true;
        return '';
    }
    $limpo = trim(preg_replace('/\s+/u', ' ', $limpo) ?? '');
    return cortar($limpo, $max);
}

/** Campo de texto livre (corpo do e-mail): mantém quebras de linha. */
function campo_texto(?string $v, int $max, bool &$invalido): string
{
    if ($v === null) {
        return '';
    }
    $v = str_replace(["\r\n", "\r"], "\n", $v);
    $limpo = preg_replace('/[^\P{C}\n\t]+/u', '', $v);
    if ($limpo === null) {
        $invalido = true;
        return '';
    }
    $limpo = trim(preg_replace("/\n{3,}/", "\n\n", $limpo) ?? '');
    return cortar($limpo, $max);
}

/** Assunto do e-mail codificado em UTF-8 (RFC 2047). */
function assunto_codificado(string $texto): string
{
    if (function_exists('mb_encode_mimeheader')) {
        return mb_encode_mimeheader($texto, 'UTF-8', 'B', "\r\n");
    }
    return '=?UTF-8?B?' . base64_encode($texto) . '?=';
}

/* ------------------------------------------------------------------ */
/* Só aceita POST                                                      */
/* ------------------------------------------------------------------ */

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    if (quer_json()) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(
            ['ok' => false, 'erro' => 'Este endereço só recebe o formulário de contato. Preencha o formulário em contato.html.'],
            JSON_UNESCAPED_UNICODE
        );
    } else {
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Este endereço só recebe o formulário de contato. Preencha o formulário em contato.html.';
    }
    exit;
}

// Corpo grande demais não é um formulário de contato.
if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 50000) {
    responder(false, 'A mensagem ficou grande demais. Resuma em até ' . MAX_MENSAGEM . ' caracteres e envie de novo.', 413);
}

/* ------------------------------------------------------------------ */
/* Honeypot: robôs preenchem o campo oculto; finge sucesso e descarta   */
/* ------------------------------------------------------------------ */

$armadilha = $_POST['website'] ?? '';
if (!is_string($armadilha) || trim($armadilha) !== '') {
    responder(true);
}

/* ------------------------------------------------------------------ */
/* Validação e limpeza                                                 */
/* ------------------------------------------------------------------ */

$problemas = []; // nomes dos campos a conferir

$inv = false;
$nome = campo_linha(bruto('nome'), MAX_NOME, $inv);
if ($inv || $nome === '') { $problemas[] = 'nome'; }

$inv = false;
$empresa = campo_linha(bruto('empresa'), MAX_EMPRESA, $inv);
if ($inv || $empresa === '') { $problemas[] = 'empresa'; }

$inv = false;
$email = campo_linha(bruto('email'), MAX_EMAIL, $inv);
if ($inv || $email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) { $problemas[] = 'e-mail'; }

$inv = false;
$telefone = campo_linha(bruto('telefone'), MAX_TELEFONE, $inv);
if ($inv || ($telefone !== '' && preg_match('/^[0-9 +().\-]{6,30}$/', $telefone) !== 1)) { $problemas[] = 'telefone'; }

$inv = false;
$assunto = campo_linha(bruto('assunto'), 60, $inv);
if ($inv || !in_array($assunto, ASSUNTOS, true)) { $problemas[] = 'assunto'; }

$inv = false;
$mensagem = campo_texto(bruto('mensagem'), MAX_MENSAGEM, $inv);
if ($inv || $mensagem === '') { $problemas[] = 'mensagem'; }

$consentimento = bruto('consentimento');
if ($consentimento === null || !in_array(strtolower(trim($consentimento)), ['1', 'on', 'sim'], true)) {
    $problemas[] = 'autorização de uso dos dados (LGPD)';
}

if ($problemas) {
    responder(
        false,
        'Não foi possível enviar. Confira: ' . implode(', ', $problemas) . '. Depois, envie de novo ou escreva para ' . DESTINO . '.',
        422
    );
}

/* ------------------------------------------------------------------ */
/* Monta e envia o e-mail                                              */
/* ------------------------------------------------------------------ */

$assuntoEmail = assunto_codificado('[Site] ' . $assunto . ' — ' . cortar($empresa, 60));

$corpo = "Nova mensagem pelo formulário do site.\n\n"
    . 'Nome: ' . $nome . "\n"
    . 'Empresa: ' . $empresa . "\n"
    . 'E-mail: ' . $email . "\n"
    . 'Telefone: ' . ($telefone !== '' ? $telefone : 'não informado') . "\n"
    . 'Assunto: ' . $assunto . "\n"
    . 'Enviado em: ' . date('d/m/Y H:i') . " (horário de Brasília)\n"
    . "Consentimento LGPD: sim\n\n"
    . "Mensagem:\n" . $mensagem . "\n";

$cabecalhos = [
    'From: ' . NOME_REMETENTE . ' <' . REMETENTE . '>',
    'Reply-To: ' . $email,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
];

$enviado = @mail(DESTINO, $assuntoEmail, $corpo, implode("\r\n", $cabecalhos));

if (!$enviado) {
    responder(
        false,
        'Não conseguimos enviar a mensagem agora. Tente de novo em alguns minutos ou escreva para ' . DESTINO . '.',
        500
    );
}

responder(true);
