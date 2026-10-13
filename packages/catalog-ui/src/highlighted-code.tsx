import hljs from 'highlight.js/lib/core';
import { memo } from 'react';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('css', css);
// TypeScript delegates JSX tags and attributes to the XML grammar.
// Register it first so TSX usage examples receive full theme highlighting.
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('typescript', typescript);

export type HighlightLanguage = 'bash' | 'css' | 'typescript';

export const HighlightedCode = memo(function HighlightedCode({
  code,
  language,
}: {
  code: string;
  language: HighlightLanguage;
}) {
  const highlighted = hljs.highlight(code, { language }).value;

  return (
    <code
      className={`hljs language-${language}`}
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  );
});
