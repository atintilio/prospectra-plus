export default function ChannelGuide() {
 return <section className="panel crm-extension" aria-label="Guia de conexão dos canais">
  <h2>Como preparar seus canais</h2>
  <details><summary>LinkedIn — cada usuário</summary>
   <ol><li>Em Configurações → Integrações, encontre o painel Conectar LinkedIn.</li><li>Clique em Conectar LinkedIn e aguarde a tela de autenticação.</li><li>Entre na sua conta nessa tela e conclua a verificação solicitada pelo LinkedIn.</li><li>Aguarde o estado Login concluído no Prospectra. Use Ampliar tela de login se precisar de mais espaço.</li></ol>
   <p>Cada usuário possui sua própria sessão. Uma tentativa pode ser cancelada pelo painel. O login não habilita automaticamente o envio de campanhas.</p>
  </details>
  <details><summary>WhatsApp — pareamento pelo administrador</summary>
   <p>A conexão atual é compartilhada pelo workspace. Os membros utilizam o número conectado pelo administrador; ainda não há um número independente por usuário.</p>
   <ol><li>O administrador abre Configurações → Conectar conta WhatsApp.</li><li>Clique em Iniciar gateway e depois em Gerar QR Code.</li><li>No celular do número comercial escolhido, abra WhatsApp → Configurações ou menu → Dispositivos conectados → Conectar dispositivo.</li><li>Leia o QR Code exibido no Prospectra. O QR é temporário; gere outro se expirar.</li><li>Atualize o estado da conexão e confirme Conectado antes de utilizar o canal.</li></ol>
   <p>Não pareie outro número em uma conexão já utilizada pela equipe. Mensagens continuam exigindo aprovação, permissão do contato e conta elegível.</p>
  </details>
  <details><summary>Se a conexão não funcionar</summary><p>Se o QR não aparecer, o administrador deve atualizar o gateway e tentar novamente. Se o telefone desconectar, consulte Dispositivos conectados no celular. Uma mensagem de envio falhou deve ser conferida antes de repetir a ação.</p></details>
 </section>;
}
