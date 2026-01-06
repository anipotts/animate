/**
 * AniMate Clipboard Monitor (Content Script)
 *
 * Captures copy events and sends them to the service worker
 * with surrounding context for rich clipboard history.
 */

(function() {
  "use strict";

  const CONTEXT_CHARS = 500; // Characters before/after selection

  // Listen for copy events
  document.addEventListener("copy", handleCopy);

  /**
   * Handle copy event
   */
  function handleCopy(event) {
    try {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      const text = selection.toString().trim();
      if (!text || text.length === 0) return;

      // Get context around selection
      const context = getSelectionContext(selection);

      // Detect if this looks like code
      const codeAnalysis = analyzeForCode(text);

      // Send to service worker
      chrome.runtime.sendMessage({
        type: "EVENT",
        action: "CLIPBOARD_COPY",
        payload: {
          text: text,
          contextBefore: context.before,
          contextAfter: context.after,
          url: window.location.href,
          domain: window.location.hostname,
          title: document.title,
          isCode: codeAnalysis.isCode,
          language: codeAnalysis.language,
          timestamp: Date.now()
        }
      }).catch(err => {
        // Extension context may be invalidated, that's okay
        console.debug("[AniMate] Could not send clipboard event:", err.message);
      });
    } catch (error) {
      console.debug("[AniMate] Clipboard capture error:", error);
    }
  }

  /**
   * Extract text context around the selection
   */
  function getSelectionContext(selection) {
    const result = { before: "", after: "" };

    try {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;

      // Get the parent element that contains text
      const textNode = container.nodeType === Node.TEXT_NODE
        ? container
        : container.firstChild;

      if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
        return result;
      }

      const fullText = textNode.textContent || "";
      const startOffset = range.startOffset;
      const endOffset = range.endOffset;

      // Get text before selection
      const beforeStart = Math.max(0, startOffset - CONTEXT_CHARS);
      result.before = fullText.slice(beforeStart, startOffset);

      // Get text after selection
      const afterEnd = Math.min(fullText.length, endOffset + CONTEXT_CHARS);
      result.after = fullText.slice(endOffset, afterEnd);
    } catch (error) {
      // Context extraction failed, that's okay
    }

    return result;
  }

  /**
   * Analyze text to detect if it's code
   */
  function analyzeForCode(text) {
    const result = { isCode: false, language: null };

    // Common code patterns
    const codePatterns = [
      // JavaScript/TypeScript
      { pattern: /\b(const|let|var|function|class|import|export|async|await)\b/, lang: "javascript" },
      { pattern: /=>\s*[{(]/, lang: "javascript" },
      { pattern: /\.(then|catch|finally)\s*\(/, lang: "javascript" },

      // Python
      { pattern: /\b(def|class|import|from|if __name__|print\()\b/, lang: "python" },
      { pattern: /:\s*$/, lang: "python" },

      // HTML/JSX
      { pattern: /<[a-zA-Z][^>]*>/, lang: "html" },
      { pattern: /className=/, lang: "jsx" },

      // CSS
      { pattern: /{\s*[\w-]+\s*:\s*[^}]+}/, lang: "css" },
      { pattern: /\.([\w-]+)\s*{/, lang: "css" },

      // SQL
      { pattern: /\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN)\b/i, lang: "sql" },

      // Shell/Bash
      { pattern: /^\s*(#!\/bin|apt-get|npm|yarn|pip|brew|curl|wget|git|docker)/m, lang: "shell" },

      // JSON
      { pattern: /^\s*[{\[][\s\S]*[}\]]\s*$/, lang: "json" },

      // General code indicators
      { pattern: /[;{}()\[\]].*[;{}()\[\]]/, lang: null },
      { pattern: /\b(null|undefined|true|false|return|throw)\b/, lang: null }
    ];

    // Check each pattern
    for (const { pattern, lang } of codePatterns) {
      if (pattern.test(text)) {
        result.isCode = true;
        if (lang && !result.language) {
          result.language = lang;
        }
      }
    }

    // Additional heuristics for code detection
    const lines = text.split("\n");
    if (lines.length > 1) {
      // Multiple lines with consistent indentation suggests code
      const indentedLines = lines.filter(l => /^\s{2,}/.test(l));
      if (indentedLines.length > lines.length * 0.3) {
        result.isCode = true;
      }
    }

    // High density of special characters suggests code
    const specialChars = (text.match(/[{}()\[\];:=<>+\-*\/&|!?]/g) || []).length;
    const ratio = specialChars / text.length;
    if (ratio > 0.1) {
      result.isCode = true;
    }

    return result;
  }

  console.log("[AniMate] Clipboard monitor loaded");
})();
