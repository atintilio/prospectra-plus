export default function ChannelGuide() {
 return <section className="panel crm-extension" aria-label="Guia de conexão dos canais">
  <h2>Como preparar seus canais</h2>
  <details><summary>LinkedIn — cada usuário</summary>
   <ol><li>Abra o LinkedIn no seu navegador e entre na sua própria conta.</li><li>No Prospectra, acesse Campanhas e escolha uma tarefa de LinkedIn.</li><li>Confira o contato e a mensagem aprovada; abra o perfil indicado pela tarefa.</li><li>Realize a ação no LinkedIn e registre a conclusão no Prospectra.</li></ol>
   <p>Este é o modo assistido. Entrar no LinkedIn não ativa envio automático nem transfere sua sessão para o Prospectra. Não compartilhe senha ou cookies.</p>
  </details>
  <details><summary>WhatsApp — pareamento pelo administrador</summary>
   <p>A conexão atual é compartilhada pelo workspace. Os membros utilizam o número conectado pelo administrador; ainda não há um número independente por usuário.</p>
   <ol><li>O administrador abre Configurações → Conectar conta WhatsApp.</li><li>Clique em Iniciar gateway e depois em Gerar QR Code.</li><li>No celular do número comercial escolhido, abra WhatsApp → Configurações ou menu → Dispositivos conectados → Conectar dispositivo.</li><li>Leia o QR Code exibido no Prospectra. O QR é temporário; gere outro se expirar.</li><li>Atualize o estado da conexão e confirme Conectado antes de utilizar o canal.</li></ol>
   <p>Não pareie outro número em uma conexão já utilizada pela equipe. Mensagens continuam exigindo aprovação, permissão do contato e conta elegível.</p>
  </details>
  <details><summary>Se a conexão não funcionar</summary><p>Se o QR não aparecer, o administrador deve atualizar o gateway e tentar novamente. Se o telefone desconectar, consulte Dispositivos conectados no celular. Uma mensagem de envio falhou deve ser conferida antes de repetir a ação.</p></details>
 </section>;
}
