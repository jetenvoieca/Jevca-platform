"use client";

import { useCallback, useState } from "react";
import {
  BLOCK_SPACING_LIMITS,
  BLOCK_WIDTH_LIMITS,
  cleanBlockSpacing,
  cleanBlockWidth,
  sectionParts,
  sectionSpacingBelow,
  type HorizontalAlign,
  type SectionLayout,
  type SectionPart,
  type SectionSpacing,
} from "@/lib/pageStyleLayout";
import { rowClass, type PreviewDevice } from "@/components/pageRows";
import { PageTitleBar, SectionPartShape } from "@/components/PageStylePreview";
import NumberField from "@/components/NumberField";
import {
  BarButton,
  BarDivider,
  DeviceSwitch,
  EditableBlock,
  PageFrame,
  PanelBox,
  ScaledFrame,
  SelectionBar,
  SpacingHandle,
  desktopContentWidth,
  useSelectionKeys,
} from "@/components/visualEditorParts";

// The visual editor for a Section Page Style (2026-10-07) — the same
// pieces as the Private / Custom editor (visualEditorParts), for a
// Section's fixed parts: byline, artwork grid, Description and, when the
// style has one, a video. They can't be added or moved, but each can be
// sized (drag its edge), the gaps between them and the page margin
// dragged, and its alignment set from its bar, which also has Fine-tune
// (its exact width and the space below it) and, for the video, Remove
// (as does Delete). The video is added from the side panel.
// Every change goes straight to `onChange`, which saves it.

const PART_NAMES: Record<SectionPart, string> = {
  byline: "Byline",
  grid: "Artwork grid",
  description: "Description",
  video: "Video",
};

export default function SectionVisualEditor({
  layout,
  onChange,
}: {
  layout: SectionLayout;
  onChange: (layout: SectionLayout) => void;
}) {
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [selected, setSelected] = useState<SectionPart | null>(null);

  const deselect = useCallback(() => setSelected(null), []);
  const removeVideo = useCallback(() => {
    onChange({ ...layout, video: false });
    setSelected(null);
  }, [layout, onChange]);
  useSelectionKeys(!!selected, deselect, selected === "video" ? removeVideo : undefined);

  const parts = sectionParts(layout);
  const contentWidth = desktopContentWidth(layout.margins);

  const setSpacing = (key: keyof SectionSpacing, value: number) =>
    onChange({ ...layout, spacing: { ...layout.spacing, [key]: cleanBlockSpacing(value) } });
  const setWidth = (part: SectionPart, width: number) =>
    onChange({ ...layout, widths: { ...layout.widths, [part]: cleanBlockWidth(width) } });
  const setAlign = (part: SectionPart, horizontal: HorizontalAlign) =>
    onChange({ ...layout, aligns: { ...layout.aligns, [part]: horizontal } });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <DeviceSwitch device={device} onDevice={setDevice} />
      <ScaledFrame device={device}>
        <PageFrame
          margins={layout.margins}
          device={device}
          backgroundColor={layout.backgroundColor}
          onMargins={(margins) => onChange({ ...layout, margins })}
          onDeselect={deselect}
        >
          <div className="flex flex-col">
            <PageTitleBar />
          </div>
          {parts.map((part, i) => {
            const above = i > 0 ? sectionSpacingBelow(parts[i - 1]) : null;
            const below = i < parts.length - 1 ? sectionSpacingBelow(part) : null;
            return (
              <div key={part}>
                {above && (
                  <SpacingHandle
                    direction="vertical"
                    value={layout.spacing[above]}
                    onChange={(value) => setSpacing(above, value)}
                  />
                )}
                <div className={rowClass(layout.aligns[part], "top", device)}>
                  <PartItem
                    part={part}
                    device={device}
                    width={layout.widths[part]}
                    horizontal={layout.aligns[part]}
                    spaceBelow={below ? layout.spacing[below] : null}
                    contentWidth={contentWidth}
                    gridSpacing={layout.gridSpacing}
                    selected={part === selected}
                    onSelect={() => setSelected(part)}
                    onWidth={(width) => setWidth(part, width)}
                    onAlign={(horizontal) => setAlign(part, horizontal)}
                    onSpaceBelow={below ? (value) => setSpacing(below, value) : null}
                    onRemove={part === "video" ? removeVideo : null}
                  />
                </div>
              </div>
            );
          })}
        </PageFrame>
      </ScaledFrame>
    </div>
  );
}

function PartItem({
  part,
  device,
  width,
  horizontal,
  spaceBelow,
  contentWidth,
  gridSpacing,
  selected,
  onSelect,
  onWidth,
  onAlign,
  onSpaceBelow,
  onRemove,
}: {
  part: SectionPart;
  device: PreviewDevice;
  width: number;
  horizontal: HorizontalAlign;
  spaceBelow: number | null;
  contentWidth: number;
  gridSpacing: SectionLayout["gridSpacing"];
  selected: boolean;
  onSelect: () => void;
  onWidth: (width: number) => void;
  onAlign: (horizontal: HorizontalAlign) => void;
  onSpaceBelow: ((value: number) => void) | null;
  onRemove: (() => void) | null;
}) {
  const [fineTune, setFineTune] = useState(false);
  return (
    <EditableBlock
      width={width}
      device={device}
      horizontal={horizontal}
      contentWidth={contentWidth}
      label={`${PART_NAMES[part]} — click to select`}
      selected={selected}
      onSelect={onSelect}
      onWidth={onWidth}
      bar={
        <SelectionBar
          desktop={device === "desktop"}
          horizontal={horizontal}
          onAlign={(patch) => patch.horizontal && onAlign(patch.horizontal)}
        >
          <BarButton active={fineTune} onClick={() => setFineTune((on) => !on)}>
            Fine-tune
          </BarButton>
          {onRemove && (
            <>
              <BarDivider />
              <BarButton danger onClick={onRemove}>
                Remove
              </BarButton>
            </>
          )}
        </SelectionBar>
      }
      panel={
        fineTune && (
          <PanelBox title="Fine-tune" onClose={() => setFineTune(false)}>
            <NumberField
              label="Width, desktop"
              unit="%"
              step={1}
              value={width}
              limits={BLOCK_WIDTH_LIMITS}
              onCommit={onWidth}
              wide
            />
            {spaceBelow !== null && onSpaceBelow && (
              <NumberField
                label="Space below"
                unit="pixels"
                step={1}
                value={spaceBelow}
                limits={BLOCK_SPACING_LIMITS}
                onCommit={onSpaceBelow}
                wide
              />
            )}
            <p className="text-xs text-neutral-400">On a phone every part is full width.</p>
          </PanelBox>
        )
      }
    >
      <SectionPartShape part={part} spacing={gridSpacing} />
    </EditableBlock>
  );
}
