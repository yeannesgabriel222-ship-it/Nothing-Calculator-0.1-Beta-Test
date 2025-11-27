/* Nothing Scientific Calc - script.js
   - Opción 2 (compacta)
   - Grados para sin/cos/tan
   - Vibración al presionar (navigator.vibrate)
   - Historial (localStorage) con click para recuperar
*/

(() => {
  // DOM
  const displayEl = document.getElementById("display");
  const historyEl = document.getElementById("historyList");
  const buttons = Array.from(document.querySelectorAll(".btn"));

  // Estado
  let expr = "";         // expresión visible (texto)
  let history = loadHistory(); // [{expr, result, time}, ...]

  // ---- Utilidades vibratorias ----
  function vibrateShort() {
    try { if (navigator.vibrate) navigator.vibrate(12); } catch(e) {}
  }

  // ---- Historial (localStorage) ----
  function loadHistory() {
    try {
      const raw = localStorage.getItem("calc_history_v1");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
  function saveHistory() {
    try { localStorage.setItem("calc_history_v1", JSON.stringify(history)); } catch(e) {}
  }
  function addHistory(exprStr, resultStr) {
    const item = { expr: exprStr, result: resultStr, time: Date.now() };
    history.unshift(item);
    if (history.length > 50) history.pop();
    saveHistory();
    renderHistory();
  }
  function renderHistory() {
    historyEl.innerHTML = "";
    if (!history.length) {
      historyEl.innerHTML = '<div style="text-align:right;color:#777;padding:6px 8px">Sin historial</div>';
      return;
    }
    history.forEach((h, idx) => {
      const d = document.createElement("div");
      d.className = "entry";
      d.innerHTML = `<div style="font-size:13px;color:#bbb;text-align:right;">${h.expr}</div>
                     <div style="font-size:16px;color:#fff;text-align:right;">= ${h.result}</div>`;
      d.addEventListener("click", () => {
        expr = h.result; updateDisplay();
        vibrateShort();
      });
      historyEl.appendChild(d);
    });
  }

  // ---- Display ----
  function updateDisplay() {
    displayEl.textContent = expr || "0";
  }

  // ---- Parser / Evaluador ----
  // Las entradas se construyen con botones: números, ., operadores, funciones como "sin(", "cos(", etc.
  // Para evaluar:
  //  - Convertimos símbolos a JS: × → *, ÷ → /
  //  - Convertimos π → Math.PI
  //  - Para sin/cos/tan (en grados) transformamos a llamadas internas que convierten a radianes.
  //  - % se maneja como división por 100 sobre el número inmediatamente anterior cuando se presiona % (implementado en botón).
  //  - Evitamos eval directo en global: creamos una Function con Math en scope.

  function safeEval(input) {
    if (!input) return "";
    // Reemplazos básicos
    let s = input.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
    // π -> Math.PI
    s = s.replace(/π/g, `(${Math.PI})`);

    // Reemplazar pow x² : we store as pow(n,2) by button insertion, but we also accept '^' maybe.
    s = s.replace(/\^/g, "**");

    // Reemplazar llamadas de funciones en notación simple:
    // Convertir 'sin(' -> 'SIN(' para evitar colisiones y luego procesar.
    s = s.replace(/sin\(/g, 'SIN(').replace(/cos\(/g, 'COS(').replace(/tan\(/g, 'TAN(').replace(/sqrt\(/g, 'SQRT(');

    // Ahora convertimos SIN(x) -> (Math.sin((x)*Math.PI/180))
    s = s.replace(/SIN\(/g, 'Math.sin((').replace(/COS\(/g, 'Math.cos((').replace(/TAN\(/g, 'Math.tan((').replace(/SQRT\(/g, 'Math.sqrt(');

    // But for SIN/COS/TAN we need degrees -> radians: wrap the inner expression multiply by Math.PI/180.
    // We do a simple pass to replace Math.sin((EXPR) with Math.sin((EXPR)*Math.PI/180)
    s = s.replace(/Math\.sin\(\(/g, 'Math.sin((('); // keep marker
    // Approach: locate Math.sin(( ... matching parenthesis and insert *Math.PI/180 before closing )
    s = insertDegreeConversion(s, 'Math.sin(');
    s = insertDegreeConversion(s, 'Math.cos(');
    s = insertDegreeConversion(s, 'Math.tan(');

    // Final safety: allow only characters/nodes we expect (numbers, Math, operators, parentheses, ., e)
    // We'll attempt evaluation with Function; if fails -> throw

    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('return ' + s + ';');
      const val = fn();
      if (typeof val === "number" && !isFinite(val)) throw new Error("infinite");
      return val;
    } catch (e) {
      throw e;
    }
  }

  // Inserta conversión a radianes en todas las llamadas a una función matemática específica
  function insertDegreeConversion(src, funcName) {
    // funcName is like 'Math.sin('
    let out = "";
    let i = 0;
    while (i < src.length) {
      const idx = src.indexOf(funcName, i);
      if (idx === -1) { out += src.slice(i); break; }
      // copy up to funcName + '('
      out += src.slice(i, idx + funcName.length);
      i = idx + funcName.length;
      // now we are at the opening parenthesis of the arg
      // parse until matching closing parenthesis to get the inner expression
      if (src[i] !== '(') {
        // if not as expected, just continue
        continue;
      }
      let depth = 0;
      let j = i;
      // find matching )
      while (j < src.length) {
        if (src[j] === '(') depth++;
        else if (src[j] === ')') {
          depth--;
          if (depth === 0) { j++; break; }
        }
        j++;
      }
      // extract inner
      const inner = src.slice(i + 1, j - 1 + 1); // maybe j already at next char
      // because of complication above, simpler strategy: find substring starting at i, find the position of the matching ) properly
      const matchEnd = findMatchingParen(src, i);
      if (matchEnd === -1) {
        // fallback: just append rest
        out += src.slice(i);
        i = src.length;
        break;
      }
      const innerExpr = src.slice(i + 1, matchEnd);
      // replace with ( innerExpr * Math.PI/180 )
      out += '(' + innerExpr + '*Math.PI/180)';
      i = matchEnd + 1;
    }
    return out;
  }

  function findMatchingParen(str, openIndex) {
    // expects str[openIndex] === '('
    if (str[openIndex] !== '(') {
      // try to find the first '(' at or after openIndex
      openIndex = str.indexOf('(', openIndex);
      if (openIndex === -1) return -1;
    }
    let depth = 0;
    for (let k = openIndex; k < str.length; k++) {
      if (str[k] === '(') depth++;
      else if (str[k] === ')') {
        depth--;
        if (depth === 0) return k;
      }
    }
    return -1;
  }

  // ---- Operaciones de construcción de expresión ----
  function insertAtEnd(token) {
    expr += token;
    updateDisplay();
  }

  // Manejo de %: cuando se presiona %, convertimos el número "anterior" en /100
  function applyPercent() {
    // intentamos convertir el último número del expr a (num/100)
    // encontrá la última secuencia de caracteres válidos de número (dígitos y punto)
    const match = expr.match(/(\d+(\.\d+)?|\.\d+)$/);
    if (!match) return;
    const num = match[0];
    const before = expr.slice(0, match.index);
    expr = before + `(${num}/100)`;
    updateDisplay();
  }

  // Manejo x²: implementado como añadir **2 (es decir potencia)
  function applySquare() {
    // si el último token es un número o ), añadimos **2
    expr += '**2';
    updateDisplay();
  }

  // ---- Botones ----
  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const act = btn.getAttribute('data-action');
      const num = btn.getAttribute('data-num');
      vibrateShort();

      if (num !== null) {
        insertAtEnd(num);
        return;
      }

      switch (act) {
        case 'paren-open': insertAtEnd('('); break;
        case 'paren-close': insertAtEnd(')'); break;
        case 'percent': applyPercent(); break;
        case 'pi': insertAtEnd('π'); break;
        case 'sin': insertAtEnd('sin('); break;
        case 'cos': insertAtEnd('cos('); break;
        case 'tan': insertAtEnd('tan('); break;
        case 'sqrt': insertAtEnd('sqrt('); break;
        case 'divide': insertAtEnd('÷'); break;
        case 'multiply': insertAtEnd('×'); break;
        case 'minus': insertAtEnd('−'); break;
        case 'plus': insertAtEnd('+'); break;
        case 'back':
          // borrar último carácter
          expr = expr.slice(0, -1);
          updateDisplay();
          break;
        case 'equals':
          handleEquals();
          break;
        default:
          // clear
          if (act === null && btn.classList.contains('op')) {
            // ...
          }
      }
    });
  });

  // tecla C (clear) -> uno de los small op no tenía data-action 'clear' en HTML; si querés que C limpie:
  // Si existe botón con textContent C -> buscamos y asignamos
  const clearBtn = Array.from(buttons).find(b => b.textContent.trim() === 'C');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => { expr = ''; updateDisplay(); vibrateShort(); });
  }

  // manejador de equals
  function handleEquals() {
    if (!expr) return;
    try {
      const input = expr;
      const result = safeEval(input);
      const out = (typeof result === 'number') ? formatNumber(result) : String(result);
      addHistory(input, out);
      expr = String(out);
      updateDisplay();
    } catch (e) {
      expr = "Error";
      updateDisplay();
      // dejar Error visible 1.2s y luego limpiar parcial al siguiente input
      setTimeout(() => { if (expr === "Error") expr = ""; updateDisplay(); }, 1200);
    }
  }

  function formatNumber(n) {
    // evitar notación exponencial grande y recortar decimales innecesarios
    if (Number.isInteger(n)) return String(n);
    // limitar a 10 decimales y quitar ceros finales
    let s = n.toFixed(10);
    s = s.replace(/\.?0+$/, '');
    return s;
  }

  // ---- teclado físico (opcional) ----
  window.addEventListener('keydown', (e) => {
    const k = e.key;
    if ((k >= '0' && k <= '9') || k === '.') { insertAtEnd(k); vibrateShort(); return; }
    if (k === 'Enter' || k === '=') { handleEquals(); vibrateShort(); return; }
    if (k === 'Backspace') { expr = expr.slice(0, -1); updateDisplay(); vibrateShort(); return; }
    if (k === '+' || k === '-') { insertAtEnd(k); vibrateShort(); return; }
    if (k === '*' || k === '/') { insertAtEnd(k === '*' ? '×' : '÷'); vibrateShort(); return; }
  });

  // ---- Init ----
  updateDisplay();
  renderHistory();

})();
