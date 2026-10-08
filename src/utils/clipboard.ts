import copy from 'copy-to-clipboard';

export const copyToClipboard = async (text: string): Promise<boolean> => {
  if (!text) return false;

  try {
    // Strategy 1: Modern navigator.clipboard API (if available and allowed by browser permissions/iframe)
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {
        console.warn("navigator.clipboard.writeText failed (likely iframe restriction), using fallback strategies...", e);
      }
    }

    // Strategy 2: copy-to-clipboard battle-tested library
    try {
      const success = copy(text, {
        debug: false,
        message: 'Press #{key} to copy',
      });
      if (success) {
        return true;
      }
    } catch (e) {
      console.warn("copy-to-clipboard library fallback failed, trying direct execCommand DOM fallback...", e);
    }

    // Strategy 3: Manual hidden textarea with document.execCommand('copy')
    if (typeof document !== 'undefined') {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      // Ensure element is off-screen but visible enough to be selectable by browser
      textArea.style.position = "fixed";
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.width = "2em";
      textArea.style.height = "2em";
      textArea.style.padding = "0";
      textArea.style.border = "none";
      textArea.style.outline = "none";
      textArea.style.boxShadow = "none";
      textArea.style.background = "transparent";
      textArea.setAttribute("readonly", "");

      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      textArea.setSelectionRange(0, text.length);

      let execSuccess = false;
      try {
        execSuccess = document.execCommand("copy");
      } catch (err) {
        console.error("document.execCommand('copy') failed:", err);
      }
      document.body.removeChild(textArea);
      if (execSuccess) return true;
    }

    return false;
  } catch (err) {
    console.error("Copy to clipboard failed completely:", err);
    return false;
  }
};

