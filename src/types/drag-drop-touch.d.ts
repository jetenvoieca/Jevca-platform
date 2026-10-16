// The drag-drop-touch library has no types of its own (see
// components/TouchDragSupport.tsx); this is the one function used.
declare module "@dragdroptouch/drag-drop-touch" {
  export function enableDragDropTouch(
    dragRoot?: Document | Element,
    dropRoot?: Document | Element,
    options?: { isPressHoldMode?: boolean; pressHoldDelayMS?: number }
  ): void;
}
