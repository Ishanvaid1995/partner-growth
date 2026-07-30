function parseMarkdownToHtml(markdownText) {
  if (!markdownText) return '';
  // Basic sanitization
  let clean = markdownText.trim();
  clean = clean.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();

  // Strip stray horizontal rules early (User requirement 3)
  clean = clean.replace(/^(?:---|___|\*\*\*)[ \t]*$/gm, '');

  // 1. Extract triple backtick code blocks to protect them (User requirement 2)
  const codeBlocks = [];
  clean = clean.replace(/```([\s\S]*?)```/g, (match, code) => {
    codeBlocks.push(code);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  // Remove package metadata lines if they leaked
  clean = clean.replace(/^\{?\s*"proposal"\s*:\s*"/i, '')
               .replace(/^"proposal"\s*:\s*"/i, '')
               .replace(/"\s*\}?\s*$/, '');

  // Convert headers (must do before tables if they share characters, but # is safe)
  clean = clean.replace(/^###\s+(.+)$/gm, '<h4>$1</h4>');
  clean = clean.replace(/^##\s+(.+)$/gm, '<h3>$1</h3>');
  clean = clean.replace(/^#\s+(.+)$/gm, '<h2>$1</h2>');

  // Convert bold/italic/inline-code
  function boldInline(text) {
    return text
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }
  
  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 2. Parse Markdown Tables robustly line-by-line (User requirement 1)
  const lines = clean.split('\n');
  const newLines = [];
  let inTable = false;
  let tableRows = [];

  function flushTable() {
    if (tableRows.length === 0) return;
    
    // Filter out separator rows like |---|---|
    const dataRows = tableRows.filter(row => !/^\|?[-:\s|]+\|?$/.test(row.trim()));
    
    if (dataRows.length > 0) {
      let tableHtml = '<div class="table-responsive"><table class="md-table">';
      
      dataRows.forEach((row, ri) => {
        // Strip leading/trailing pipes and split
        const cells = row.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        if (ri === 0) {
          tableHtml += '<thead><tr>';
          cells.forEach(c => tableHtml += `<th>${boldInline(escapeHtml(c))}</th>`);
          tableHtml += '</tr></thead><tbody>';
        } else {
          tableHtml += `<tr class="${ri % 2 === 1 ? 'alt-row' : ''}">`;
          cells.forEach(c => tableHtml += `<td>${boldInline(escapeHtml(c))}</td>`);
          tableHtml += '</tr>';
        }
      });
      tableHtml += '</tbody></table></div>';
      newLines.push(tableHtml);
    }
    tableRows = [];
    inTable = false;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|')) {
      inTable = true;
      tableRows.push(line);
    } else {
      if (inTable) {
        // Allow a blank line inside a table if the next line is also a table row
        if (line === '' && i + 1 < lines.length && lines[i+1].trim().startsWith('|')) {
          continue; // skip blank line, stay in table
        }
        flushTable();
      }
      newLines.push(lines[i]);
    }
  }
  if (inTable) flushTable();
  
  clean = newLines.join('\n');

  // Convert Lists
  clean = clean.replace(
    /((?:^[ \t]*[-*•+][ \t]+.+(?:\n|$))+)/gm,
    (match) => {
      const items = match.trim().split('\n')
        .map(l => l.trim().replace(/^[-*•+]\s+/, '').trim())
        .filter(Boolean);
      return '<ul>' + items.map(i => `<li>${boldInline(i)}</li>`).join('') + '</ul>';
    }
  );

  clean = clean.replace(
    /((?:^[ \t]*\d+\.[ \t]+.+(?:\n|$))+)/gm,
    (match) => {
      const items = match.trim().split('\n')
        .map(l => l.trim().replace(/^\d+\.\s+/, '').trim())
        .filter(Boolean);
      return '<ol>' + items.map(i => `<li>${boldInline(i)}</li>`).join('') + '</ol>';
    }
  );

  // Group paragraphs
  const parts = clean.split('\n\n');
  const result = parts.map(block => {
    const t = block.trim();
    if (!t) return '';
    if (/^<(h[2-4]|ul|ol|div|table|p|__CODE)/i.test(t)) {
      // It's already HTML (or a code block placeholder starting with __CODE)
      return t;
    }
    const pLines = t.split('\n').map(l => l.trim()).filter(Boolean);
    return `<p>${boldInline(pLines.join('<br>'))}</p>`;
  });

  let finalHtml = result.filter(Boolean).join('\n');

  // Restore Code Blocks (User requirement 2)
  codeBlocks.forEach((code, index) => {
    finalHtml = finalHtml.replace(`__CODE_BLOCK_${index}__`, `<pre><code>${escapeHtml(code.trim())}</code></pre>`);
  });

  return finalHtml;
}

const md = `
| LOWER MAINTENANCE SPEND | -15% |
|---|---|
| Boost overall equipment | +10% |

| Next table | test |
|---|---|
| A | B |

\`\`\`
+-------+
|  BOX  |
+-------+
\`\`\`

---
`;
console.log(parseMarkdownToHtml(md));
