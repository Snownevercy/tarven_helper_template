import iframe_srcdoc from './iframe_srcdoc.html';

export async function loadReadme(url: string): Promise<boolean> {
  const readme = await fetch(url);
  if (!readme.ok) {
    return false;
  }
  const readme_text = await readme.text();
  replaceScriptInfo(readme_text);
  return true;
}

export function teleportStyle(
  append_to: JQuery.Selector | JQuery.htmlString | JQuery.TypeOrArray<Element | DocumentFragment> | JQuery = 'head',
): { destroy: () => void } {
  const $div = $(`<div>`)
    .attr('script_id', getScriptId())
    .append($(`head > style`, document).clone())
    .appendTo(append_to);

  return {
    destroy: () => $div.remove(),
  };
}

export function createScriptIdIframe(): JQuery<HTMLIFrameElement> {
  return $(`<iframe>`).attr({
    script_id: getScriptId(),
    frameborder: 0,
    srcdoc: iframe_srcdoc,
  }) as JQuery<HTMLIFrameElement>;
}

<<<<<<< HEAD
/** 在指定 document 中创建 iframe（用于挂到主页面 body，脚本 iframe 内可见） */
export function createScriptIdIframeInDocument(doc: Document): HTMLIFrameElement {
  const iframe = doc.createElement('iframe');
  iframe.setAttribute('script_id', getScriptId());
  iframe.setAttribute('frameborder', '0');
  iframe.srcdoc = iframe_srcdoc;
  return iframe;
}

=======
>>>>>>> 5c392d920d8716df90a81df5e7a51219e546142b
export function createScriptIdDiv(): JQuery<HTMLDivElement> {
  return $('<div>').attr('script_id', getScriptId()) as JQuery<HTMLDivElement>;
}

export function reloadOnChatChange(): EventOnReturn {
  let chat_id = SillyTavern.getCurrentChatId();
  return eventOn(tavern_events.CHAT_CHANGED, new_chat_id => {
    if (chat_id !== new_chat_id) {
      chat_id = new_chat_id;
      window.location.reload();
    }
  });
}
