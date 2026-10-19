/** Device-local Chinese voices only; never send guide text to a remote service. */
export function localChineseVoice(): { voice: SpeechSynthesisVoice } | { error: string } {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return { error: '当前设备不支持朗读，可以在设置中选择大字号。' };
  const voice = window.speechSynthesis.getVoices().find(item => item.lang.startsWith('zh') && item.localService);
  return voice ? { voice } : { error: '这台设备暂不能朗读，请查看页面文字，或请身边的人帮忙。' };
}
