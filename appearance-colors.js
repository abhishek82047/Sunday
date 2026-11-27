/* Adapt legacy literal colors as well as design tokens. Keep the original
   value as the fallback for the default dark appearance. */
export function appearanceColors() {
  const literal = /#[\da-f]{3,8}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)|\bwhite\b/gi;
  return {
    postcssPlugin: 'sunday-appearance-colors',
    Once(root) {
      root.walkDecls(decl => {
        if (decl.source?.input.file?.endsWith('appearance.css')) return;
        const prop = decl.prop;
        if (!/^(color|fill|stroke|background(-color|-image)?|border[\w-]*|--[\w-]+)$/.test(prop)) return;
        if (decl.value.includes('url(')) return;
        decl.value = decl.value.replace(literal, original => {
          let hex = original.toLowerCase();
          let channels;
          if (hex.startsWith('rgb')) channels = hex.match(/[\d.]+/g).map(Number);
          else {
            hex = hex === 'white' ? 'ffffff' : hex.slice(1);
            if (hex.length === 3) hex = [...hex].map(ch => ch + ch).join('');
            if (hex.length !== 6) return original;
            channels = hex.match(/../g).map(pair => parseInt(pair, 16));
          }
          const [r,g,b,alpha = 1] = channels;
          const max = Math.max(r,g,b), spread = max - Math.min(r,g,b);
          const text = /^(color|fill|stroke|--text)/.test(prop);
          const fallback = token => 'var(--' + token + ', ' + original + ')';
          if (text) {
            if (spread < 60) return fallback(max > 220 ? 'ink' : 'muted');
            if (g > r * 1.45 && g > b * 1.15) return fallback('positive-ink');
            if (r > g * 1.6 && r > b * 1.3) return fallback(g > b * 1.5 ? 'warning-ink' : 'negative-ink');
            if (b > r * 1.35 && g > r * 1.2) return fallback('accent');
          } else {
            const channel = max < 85 && spread < 65 ? 'paper' : max > 225 && spread < 30 && alpha < 1 ? 'line' : '';
            if (channel) return 'rgb(var(--' + channel + ', ' + [r,g,b].join(' ') + ') / ' + alpha + ')';
          }
          return original;
        });
      });
    }
  };
}
