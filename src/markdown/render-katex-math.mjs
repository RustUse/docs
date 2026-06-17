import katex from 'katex';

const defaultKatexOptions = {
  throwOnError: false,
  strict: 'warn',
  trust: false,
  output: 'htmlAndMathml',
};

/**
 * Escape raw text for fallback HTML.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Render a Sätteri math node with KaTeX.
 *
 * @param {Readonly<{ value?: string }>} node
 * @param {unknown} ctx
 * @param {boolean} displayMode
 * @returns {{ rawHtml: string } | undefined}
 */
function renderMathNode(node, ctx, displayMode) {
  const value = typeof node.value === 'string' ? node.value.trim() : '';

  if (!value) {
    return undefined;
  }

  try {
    return {
      rawHtml: katex.renderToString(value, {
        ...defaultKatexOptions,
        displayMode,
      }),
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'KaTeX failed to render a math expression.';

    if (
      ctx &&
      typeof ctx === 'object' &&
      'report' in ctx &&
      typeof ctx.report === 'function'
    ) {
      ctx.report({
        node,
        severity: 'warning',
        message,
      });
    }

    const tag = displayMode ? 'pre' : 'code';
    const className = displayMode
      ? 'rustuse-math-error rustuse-math-error--block'
      : 'rustuse-math-error rustuse-math-error--inline';

    return {
      rawHtml: `<${tag} class="${className}">${escapeHtml(value)}</${tag}>`,
    };
  }
}

/**
 * Sätteri MDAST plugin that renders math nodes with KaTeX.
 *
 * Requires:
 *
 * ```js
 * features: {
 *   math: true,
 * }
 * ```
 *
 * @returns {{
 *   name: string,
 *   math(node: Readonly<{ value?: string }>, ctx: unknown): { rawHtml: string } | undefined,
 *   inlineMath(node: Readonly<{ value?: string }>, ctx: unknown): { rawHtml: string } | undefined,
 * }}
 */
export function renderKatexMath() {
  return {
    name: 'rustuse-render-katex-math',

    math(node, ctx) {
      return renderMathNode(node, ctx, true);
    },

    inlineMath(node, ctx) {
      return renderMathNode(node, ctx, false);
    },
  };
}
