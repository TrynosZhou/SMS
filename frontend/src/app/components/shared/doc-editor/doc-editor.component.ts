import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';

type DocShape = 'circle' | 'square' | 'rectangle' | 'triangle' | 'polygon' | 'arrow';

@Component({
  selector: 'app-doc-editor',
  templateUrl: './doc-editor.component.html',
  styleUrls: ['./doc-editor.component.css'],
})
export class DocEditorComponent implements OnChanges {
  @Input() value = '';
  @Input() surfaceMinHeight = 220;
  @Output() valueChange = new EventEmitter<string>();
  @ViewChild('editor') editorRef?: ElementRef<HTMLDivElement>;

  shapes: Array<{ key: DocShape; label: string }> = [
    { key: 'circle',    label: 'Circle'    },
    { key: 'square',    label: 'Square'    },
    { key: 'rectangle', label: 'Rectangle' },
    { key: 'triangle',  label: 'Triangle'  },
    { key: 'polygon',   label: 'Polygon'   },
    { key: 'arrow',     label: 'Arrow'     },
  ];

  private lastEmitted = '';
  private savedRange: Range | null = null;

  textColor     = '#111827';
  fontSizeIndex = 4;
  readonly fontSizeOptions: Array<{ index: number; px: number }> = [
    { index: 2, px: 12 },
    { index: 3, px: 14 },
    { index: 4, px: 16 },
    { index: 5, px: 18 },
    { index: 6, px: 20 },
    { index: 7, px: 24 },
  ];

  shapeStrokeHex   = '#1d4ed8';
  shapeFillHex     = '#1d4ed8';
  shapeFillAlpha   = 0.12;
  shapeStrokeWidth = 3;

  private activeResize: null | {
    el: HTMLElement;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    minW: number;
    minH: number;
  } = null;

  private savedUserSelect: string | null = null;
  private maybeDrag: { wrap: HTMLElement; startX: number; startY: number } | null = null;
  private activeDrag: {
    wrap: HTMLElement;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
  } | null = null;
  private dragListenersAdded  = false;
  private selectedShapeWrap: HTMLElement | null = null;

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['value']) return;
    const next = this.value ?? '';
    if (next === this.lastEmitted) return;
    const editorEl = this.editorRef?.nativeElement;
    if (!editorEl) return;
    if (editorEl.innerHTML !== next) {
      editorEl.innerHTML = next || '';
      this.revealTextInShapes(editorEl);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private getSelectedFontPx(): number {
    return this.fontSizeOptions.find(o => o.index === this.fontSizeIndex)?.px ?? 16;
  }

  private revealTextInShapes(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('.doc-shape-wrap').forEach(shapeEl => {
      const textEl = shapeEl.querySelector<HTMLElement>('.doc-shape-text');
      if (!textEl) return;
      const hasContent = (textEl.textContent || '').trim().length > 0;
      textEl.classList.toggle('is-hidden',  !hasContent);
      textEl.classList.toggle('is-visible',  hasContent);
    });
  }

  private selectShapeWrap(next: HTMLElement | null): void {
    if (this.selectedShapeWrap === next) return;
    this.selectedShapeWrap?.classList.remove('is-selected');
    this.selectedShapeWrap = next;
    this.selectedShapeWrap?.classList.add('is-selected');
  }

  private resolveShapeWrapFromSelection(editorEl: HTMLElement): HTMLElement | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const anchorNode = sel.anchorNode;
    if (!anchorNode) return null;
    const anchorEl =
      anchorNode instanceof HTMLElement ? anchorNode : anchorNode.parentElement;
    if (!anchorEl) return null;
    const wrap = anchorEl.closest('.doc-shape-wrap') as HTMLElement | null;
    return wrap && editorEl.contains(wrap) ? wrap : null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public editor actions
  // ─────────────────────────────────────────────────────────────────────────

  focusEditor(): void {
    this.editorRef?.nativeElement?.focus();
  }

  captureSelection(): void {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      this.savedRange = sel.getRangeAt(0).cloneRange();
    }
  }

  onInput(): void {
    const editorEl = this.editorRef?.nativeElement;
    if (!editorEl) return;
    const html = editorEl.innerHTML ?? '';
    const withoutBr = html.replace(/<br\s*\/?>/gi, '').replace(/\u00A0/g, ' ').trim();
    const normalized = withoutBr.length === 0 ? '' : html;
    this.lastEmitted = normalized;
    this.valueChange.emit(normalized);
  }

  exec(cmd: string, value?: string): void {
    this.focusEditor();
    try { document.execCommand(cmd, false, value); } catch { /* ignore */ }
    this.onInput();
  }

  applyTextColor(): void { this.exec('foreColor', this.textColor); }
  applyFontSize():  void { this.exec('fontSize',  String(this.fontSizeIndex)); }

  // FIX: clicking outside any shape must deselect it AND let the browser
  // place the editor caret at the clicked position.
  // We must NOT stopPropagation or preventDefault here — let the click
  // fall through naturally to the contenteditable editor.
  onEditorPointerDown(ev: PointerEvent): void {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const wrap = target.closest('.doc-shape-wrap') as HTMLElement | null;
    if (!wrap) {
      // Clicked on bare editor area — deselect shape, caret goes where
      // the browser decides based on the natural click position.
      this.selectShapeWrap(null);
      // No stopPropagation, no preventDefault — browser handles caret.
    }
  }

  activateSelectedShapeText(): void {
    const editorEl = this.editorRef?.nativeElement;
    if (!editorEl) return;
    let wrap = this.selectedShapeWrap;
    if (!wrap || !editorEl.contains(wrap)) {
      wrap = this.resolveShapeWrapFromSelection(editorEl);
      if (!wrap) wrap = editorEl.querySelector<HTMLElement>('.doc-shape-wrap');
      this.selectShapeWrap(wrap);
    }
    if (!wrap) return;
    const text = wrap.querySelector<HTMLElement>('.doc-shape-text');
    if (!text) return;
    this.showTextForShape(text);
  }

  insertShape(shape: DocShape): void {
    this.focusEditor();
    const sel   = window.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : this.savedRange;
    if (!range) return;
    const wrap = this.createShapeWrap(shape);
    range.deleteContents();
    range.insertNode(wrap);
    this.selectShapeWrap(wrap);
    range.setStartAfter(wrap);
    range.setEndAfter(wrap);
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
    this.onInput();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Shape creation
  // ─────────────────────────────────────────────────────────────────────────

  private createShapeWrap(shape: DocShape): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className           = 'doc-shape-wrap';
    wrap.setAttribute('contenteditable', 'false');
    wrap.style.width         = '140px';
    wrap.style.height        = '90px';
    wrap.style.position      = 'relative';
    wrap.style.display       = 'inline-block';
    wrap.style.verticalAlign = 'middle';
    wrap.style.margin        = '4px';

    // ── SVG ───────────────────────────────────────────────────────────────
    const svg = this.createShapeSvg(shape);
    svg.style.width         = '100%';
    svg.style.height        = '100%';
    svg.style.display       = 'block';
    svg.style.pointerEvents = 'none';
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // ── Text overlay ──────────────────────────────────────────────────────
    const text = document.createElement('div');
    text.className            = 'doc-shape-text is-hidden';
    text.setAttribute('contenteditable', 'true');
    text.setAttribute('spellcheck', 'false');
    text.textContent          = '';
    text.style.position       = 'absolute';
    text.style.inset          = '8px 22px 22px 8px';
    text.style.display        = 'block';
    text.style.textAlign      = 'left';
    text.style.padding        = '8px';
    text.style.boxSizing      = 'border-box';
    text.style.overflow       = 'auto';
    text.style.whiteSpace     = 'pre-wrap';
    text.style.background     = 'transparent';
    text.style.border         = 'none';
    text.style.outline        = 'none';
    text.style.zIndex         = '2';
    text.style.cursor         = 'text';
    text.style.wordBreak      = 'break-word';
    text.style.color          = this.textColor;
    text.style.fontSize       = `${this.getSelectedFontPx()}px`;

    text.addEventListener('input', () => this.onInput());
    text.addEventListener('blur',  () => this.onInput());
    text.addEventListener('keydown', (ev: KeyboardEvent) => {
      // Keep key handling within the shape textbox.
      ev.stopPropagation();
      // Prevent deleting the whole shape when textbox is empty.
      const plain = (text.textContent || '').replace(/\u00A0/g, ' ').trim();
      if ((ev.key === 'Backspace' || ev.key === 'Delete') && plain.length === 0) {
        ev.preventDefault();
      }
    });

    // FIX: when the text overlay is VISIBLE, stop the click from bubbling
    // to the wrap handler (which would call revealText again and fight
    // with the browser's caret placement).
    // When HIDDEN, let it bubble — the wrap handler needs to fire to reveal it.
    // NEVER call preventDefault — that kills the browser's focus/caret pipeline.
    text.addEventListener('pointerdown', (ev: PointerEvent) => {
      if (!text.classList.contains('is-hidden')) {
        ev.stopPropagation(); // visible: stop wrap handler interfering
        // no preventDefault — browser places caret where user clicked
      }
      // hidden: do nothing, let event bubble to wrap handler
    });

    // ── Resize handle ─────────────────────────────────────────────────────
    const handle = document.createElement('div');
    handle.className      = 'doc-resize-handle';
    handle.setAttribute('aria-label', 'Resize shape');
    handle.innerHTML      = '<span class="doc-resize-plus">+</span>';
    handle.style.position = 'absolute';
    handle.style.bottom   = '0';
    handle.style.right    = '0';
    handle.style.zIndex   = '3';

    wrap.appendChild(svg);
    wrap.appendChild(text);
    wrap.appendChild(handle);
    this.attachResizeHandlers(wrap, handle);

    // ── Wrap pointer handler ──────────────────────────────────────────────
    wrap.addEventListener('pointerdown', (ev: PointerEvent) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('.doc-resize-handle')) return;

      // NEVER call preventDefault here — kills the browser focus pipeline.
      // stopPropagation is called selectively below.

      this.editorRef?.nativeElement
        ?.querySelectorAll<HTMLElement>('.doc-shape-menu')
        .forEach(m => (m.style.display = 'none'));

      this.selectShapeWrap(wrap);

      const textHidden = text.classList.contains('is-hidden');

      if (!textHidden) {
        // Text already visible — just focus it.
        // stopPropagation so editor's onEditorPointerDown doesn't deselect shape.
        ev.stopPropagation();
        text.focus();
        return;
      }

      // Text hidden — reveal and track for drag.
      // stopPropagation so the editor doesn't also try to move its caret
      // while we are activating the shape text.
      ev.stopPropagation();
      this.revealText(text);

      this.maybeDrag = { wrap, startX: ev.clientX, startY: ev.clientY };
      this.ensureDragListeners();
    });

    wrap.addEventListener('dblclick', (ev: MouseEvent) => {
      ev.stopPropagation();
      this.revealText(text);
    });

    return wrap;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Text reveal & focus
  // ─────────────────────────────────────────────────────────────────────────

  private revealText(textEl: HTMLElement): void {
    textEl.classList.remove('is-hidden');
    textEl.classList.add('is-visible');
    this.onInput();
    setTimeout(() => this.focusTextAndPlaceCaret(textEl), 0);
  }

  private showTextForShape(textEl: HTMLElement): void {
    const wrap = textEl.closest('.doc-shape-wrap') as HTMLElement | null;
    if (wrap) this.selectShapeWrap(wrap);
    this.revealText(textEl);
  }

  private focusTextAndPlaceCaret(textEl: HTMLElement): void {
    textEl.focus();
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    if (!textEl.firstChild) {
      textEl.appendChild(document.createTextNode(''));
    }
    range.selectNodeContents(textEl);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Resize
  // ─────────────────────────────────────────────────────────────────────────

  private attachResizeHandlers(wrap: HTMLElement, handle: HTMLDivElement): void {
    handle.addEventListener('pointerdown', (ev: PointerEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation?.();
      handle.setPointerCapture?.(ev.pointerId);
      const rect = wrap.getBoundingClientRect();
      if (this.savedUserSelect === null) {
        this.savedUserSelect = document.body.style.userSelect;
      }
      document.body.style.userSelect = 'none';
      wrap.style.userSelect          = 'none';
      this.activeResize = {
        el: wrap,
        startX: ev.clientX,
        startY: ev.clientY,
        startW: rect.width,
        startH: rect.height,
        minW: 60,
        minH: 40,
      };
      this.focusEditor();
    });

    window.addEventListener('pointermove', (ev: PointerEvent) => {
      if (!this.activeResize) return;
      ev.preventDefault();
      const w = Math.max(
        this.activeResize.minW,
        this.activeResize.startW + (ev.clientX - this.activeResize.startX),
      );
      const h = Math.max(
        this.activeResize.minH,
        this.activeResize.startH + (ev.clientY - this.activeResize.startY),
      );
      this.activeResize.el.style.width  = `${Math.round(w)}px`;
      this.activeResize.el.style.height = `${Math.round(h)}px`;
    });

    window.addEventListener('pointerup', () => {
      if (!this.activeResize) return;
      this.activeResize              = null;
      document.body.style.userSelect = this.savedUserSelect ?? '';
      this.savedUserSelect           = null;
      wrap.style.userSelect          = '';
      this.onInput();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Drag
  // ─────────────────────────────────────────────────────────────────────────

  private ensureDragListeners(): void {
    if (this.dragListenersAdded) return;
    this.dragListenersAdded = true;

    const onPointerMove = (ev: PointerEvent) => {
      if (this.activeResize) return;

      if (this.activeDrag) {
        const editorEl = this.editorRef?.nativeElement;
        const newLeft  = this.activeDrag.startLeft + (ev.clientX - this.activeDrag.startX);
        const newTop   = this.activeDrag.startTop  + (ev.clientY - this.activeDrag.startY);
        if (editorEl) {
          const maxLeft = Math.max(0, editorEl.scrollWidth  - this.activeDrag.wrap.offsetWidth);
          const maxTop  = Math.max(0, editorEl.scrollHeight - this.activeDrag.wrap.offsetHeight);
          this.activeDrag.wrap.style.left = `${Math.max(0, Math.min(newLeft, maxLeft))}px`;
          this.activeDrag.wrap.style.top  = `${Math.max(0, Math.min(newTop,  maxTop ))}px`;
        } else {
          this.activeDrag.wrap.style.left = `${newLeft}px`;
          this.activeDrag.wrap.style.top  = `${newTop}px`;
        }
        ev.preventDefault();
        return;
      }

      if (this.maybeDrag) {
        const dist = Math.hypot(
          ev.clientX - this.maybeDrag.startX,
          ev.clientY - this.maybeDrag.startY,
        );
        if (dist > 5) {
          const { wrap } = this.maybeDrag;
          const editorEl = this.editorRef?.nativeElement;
          if (!editorEl) { this.maybeDrag = null; return; }
          const er        = editorEl.getBoundingClientRect();
          const wr        = wrap.getBoundingClientRect();
          const startLeft = wr.left - er.left + editorEl.scrollLeft;
          const startTop  = wr.top  - er.top  + editorEl.scrollTop;
          wrap.style.position      = 'absolute';
          wrap.style.margin        = '0';
          wrap.style.verticalAlign = 'top';
          wrap.style.left          = `${startLeft}px`;
          wrap.style.top           = `${startTop}px`;
          if (this.savedUserSelect === null) {
            this.savedUserSelect = document.body.style.userSelect;
          }
          document.body.style.userSelect = 'none';
          wrap.style.cursor = 'grabbing';
          this.activeDrag = {
            wrap,
            startX: ev.clientX,
            startY: ev.clientY,
            startLeft,
            startTop,
          };
          this.maybeDrag = null;
          ev.preventDefault();
        }
      }
    };

    const onPointerUp = () => {
      if (this.activeDrag) {
        this.activeDrag.wrap.style.cursor = '';
        document.body.style.userSelect    = this.savedUserSelect ?? '';
        this.savedUserSelect              = null;
        this.activeDrag                   = null;
        this.onInput();
      }
      this.maybeDrag = null;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SVG shape drawing
  // ─────────────────────────────────────────────────────────────────────────

  private createShapeSvg(shape: DocShape): SVGElement {
    const ns  = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width',   '100%');
    svg.setAttribute('height',  '100%');
    svg.setAttribute('viewBox', '0 0 140 90');
    svg.style.pointerEvents = 'none';
    svg.style.display       = 'block';

    const stroke = this.shapeStrokeHex;
    const fill   = this.hexToRgba(this.shapeFillHex, this.shapeFillAlpha);
    const sw     = String(this.shapeStrokeWidth);

    const common = (el: SVGElement): SVGElement => {
      el.setAttribute('stroke',       stroke);
      el.setAttribute('stroke-width', sw);
      el.setAttribute('fill',         fill);
      return el;
    };

    if (shape === 'circle') {
      const c = common(document.createElementNS(ns, 'circle'));
      c.setAttribute('cx', '70');
      c.setAttribute('cy', '45');
      c.setAttribute('r',  '32');
      svg.appendChild(c);
    } else if (shape === 'square') {
      const r = common(document.createElementNS(ns, 'rect'));
      r.setAttribute('x',      '42');
      r.setAttribute('y',      '17');
      r.setAttribute('width',  '56');
      r.setAttribute('height', '56');
      svg.appendChild(r);
    } else if (shape === 'rectangle') {
      const r = common(document.createElementNS(ns, 'rect'));
      r.setAttribute('x',      '30');
      r.setAttribute('y',      '20');
      r.setAttribute('width',  '80');
      r.setAttribute('height', '50');
      svg.appendChild(r);
    } else if (shape === 'triangle') {
      const p = common(document.createElementNS(ns, 'polygon'));
      p.setAttribute('points', '70,14 122,76 18,76');
      svg.appendChild(p);
    } else if (shape === 'polygon') {
      const p = common(document.createElementNS(ns, 'polygon'));
      p.setAttribute('points', '70,14 106,28 118,62 70,76 22,62 34,28');
      svg.appendChild(p);
    } else if (shape === 'arrow') {
      const shaft = document.createElementNS(ns, 'line');
      shaft.setAttribute('x1',             '20');
      shaft.setAttribute('y1',             '45');
      shaft.setAttribute('x2',             '95');
      shaft.setAttribute('y2',             '45');
      shaft.setAttribute('stroke',         stroke);
      shaft.setAttribute('stroke-width',   sw);
      shaft.setAttribute('stroke-linecap', 'round');
      shaft.setAttribute('fill',           'none');
      svg.appendChild(shaft);
      const head = document.createElementNS(ns, 'polyline');
      head.setAttribute('points',          '95,45 78,28 78,62');
      head.setAttribute('stroke',          stroke);
      head.setAttribute('stroke-width',    sw);
      head.setAttribute('fill',            fill);
      head.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(head);
    }

    return svg;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Utility
  // ─────────────────────────────────────────────────────────────────────────

  private hexToRgba(hex: string, alpha: number): string {
    const h = (hex || '').trim().replace('#', '');
    if (h.length !== 6) return `rgba(0,0,0,${alpha})`;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}