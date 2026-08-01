"use client";

import { Gift, Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { LotteryCampaign } from "../../server/embeds/types";
import { Button } from "../ui/button";

const SPIN_DURATION_MS = 3_600;
const FULL_TURNS = 6;
const LOSS_SEGMENT_ID = "lottery-no-prize";
const SEGMENT_COLORS = [
  "rgb(var(--primary))",
  "rgb(var(--info))",
  "rgb(var(--warning))",
  "rgb(var(--danger))",
  "rgb(var(--success))",
] as const;

type WheelSegment = Readonly<{
  id: string;
  label: string;
  probability: number;
  color: string;
}>;

export function LotteryWheel(props: Readonly<{
  campaign: LotteryCampaign;
  disabled: boolean;
  pending: boolean;
  onSpin: () => Promise<LotteryCampaign | null>;
  onComplete: (campaign: LotteryCampaign) => void;
}>) {
  const segments = useMemo(() => wheelSegments(props.campaign), [props.campaign]);
  const initialTarget = props.campaign.currentEntry ? resultSegmentIndex(props.campaign, segments) : -1;
  const [rotation, setRotation] = useState(() => stopRotation(initialTarget, segments.length));
  const [duration, setDuration] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const mounted = useRef(true);
  const busy = props.pending || spinning;
  useEffect(() => () => { mounted.current = false; }, []);

  async function spin() {
    if (busy || props.disabled) return;
    setSpinning(true);
    const result = await props.onSpin();
    if (!mounted.current) return;
    if (!result) {
      setSpinning(false);
      return;
    }
    const target = resultSegmentIndex(result, segments);
    const nextDuration = reducedMotion() ? 0 : SPIN_DURATION_MS;
    setDuration(nextDuration);
    setRotation((current) => nextRotation(current, target, segments.length));
    await waitForSpin(nextDuration);
    if (!mounted.current) return;
    setSpinning(false);
    props.onComplete(result);
  }

  return <section aria-labelledby="lottery-wheel-heading" className="w-full">
    <div className="text-center"><p className="text-xs font-semibold text-primary-strong">INSTANT DRAW</p><h3 id="lottery-wheel-heading" className="mt-1 text-xl font-semibold">幸运转盘</h3></div>
    <div className="relative mx-auto mt-4 aspect-square w-full max-w-[420px]" data-testid="lottery-wheel">
      <div className="absolute left-1/2 top-[-2px] z-20 -translate-x-1/2" aria-hidden="true">
        <div className="h-0 w-0 border-x-[16px] border-t-[30px] border-x-transparent border-t-foreground drop-shadow-md" />
      </div>
      <div className="absolute inset-3 rounded-full bg-surface p-2 shadow-elevated ring-1 ring-border-strong sm:inset-4">
        <div role="img" aria-label={wheelLabel(segments)} className="relative size-full overflow-hidden rounded-full border-4 border-surface"
          style={{ background: segmentGradient(segments), transform: `rotate(${rotation}deg)`, transition: `transform ${duration}ms cubic-bezier(0.12, 0.72, 0.08, 1)` }}>
          {segments.map((segment, index) => <span key={segment.id} className="absolute left-1/2 top-1/2 flex size-8 items-center justify-center rounded-full bg-black/55 text-xs font-bold text-white shadow-sm"
            style={segmentMarkerStyle(index, segments.length, rotation, duration)} aria-hidden="true">{index + 1}</span>)}
          <span className="absolute left-1/2 top-1/2 flex size-[26%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-4 border-surface bg-foreground text-primary-foreground shadow-elevated" aria-hidden="true">
            <span className="flex flex-col items-center" style={{ transform: `rotate(${-rotation}deg)`, transition: `transform ${duration}ms cubic-bezier(0.12, 0.72, 0.08, 1)` }}><Sparkles className="size-5" /><span className="mt-1 text-xs font-semibold">抽奖</span></span>
          </span>
        </div>
      </div>
    </div>
    <WheelLegend segments={segments} />
    <Button type="button" className="mt-4 min-h-14 w-full text-base" disabled={busy || props.disabled} onClick={() => void spin()}>
      {busy ? <Loader2 className="size-5 animate-spin" /> : <Gift className="size-5" />}{busy ? "好运转动中…" : "立即抽奖"}
    </Button>
    <p className="sr-only" role="status" aria-live="polite">{busy ? "转盘正在旋转，抽奖结果即将公布" : ""}</p>
  </section>;
}

function WheelLegend({ segments }: Readonly<{ segments: readonly WheelSegment[] }>) {
  return <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">{segments.map((segment, index) => <li key={segment.id} className="flex min-w-0 items-center gap-2">
    <span className="flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white" style={{ backgroundColor: segment.color }}>{index + 1}</span>
    <span className="min-w-0 flex-1 break-words leading-4 text-muted">{segment.label}</span><strong className="tabular-nums">{formatProbability(segment.probability)}</strong>
  </li>)}</ul>;
}

function wheelSegments(campaign: LotteryCampaign): WheelSegment[] {
  const prizes = campaign.prizes.map((prize, index) => {
    const inventory = campaign.prizeInventory.find((item) => item.prizeId === prize.id);
    if (!inventory) throw new Error(`奖品 ${prize.name} 缺少库存数据`);
    if (prize.probability === null) throw new Error(`即时抽奖奖品 ${prize.name} 缺少中奖率`);
    return { id: prize.id, label: prize.name, probability: inventory.remaining > 0 ? prize.probability : 0, color: SEGMENT_COLORS[index % SEGMENT_COLORS.length]! };
  });
  const winningProbability = prizes.reduce((sum, prize) => sum + prize.probability, 0);
  return [...prizes, { id: LOSS_SEGMENT_ID, label: "谢谢参与", probability: Math.max(0, 100 - winningProbability), color: "rgb(var(--foreground-muted))" }];
}

function resultSegmentIndex(campaign: LotteryCampaign, segments: readonly WheelSegment[]) {
  const entry = campaign.currentEntry;
  if (!entry || entry.status === "not_won") return segments.length - 1;
  if (!entry.prizeId) throw new Error("中奖记录缺少奖品标识");
  const index = segments.findIndex((segment) => segment.id === entry.prizeId);
  if (index < 0) throw new Error(`中奖奖品 ${entry.prizeId} 不在当前奖池中`);
  return index;
}

function nextRotation(current: number, target: number, count: number) {
  const normalized = ((current % 360) + 360) % 360;
  const stop = stopRotation(target, count);
  const alignment = (stop - normalized + 360) % 360;
  return current + FULL_TURNS * 360 + alignment;
}

function stopRotation(target: number, count: number) {
  if (target < 0 || count < 1) return 0;
  const center = (target + 0.5) * (360 / count);
  return (360 - center) % 360;
}

function segmentGradient(segments: readonly WheelSegment[]) {
  const size = 360 / segments.length;
  const stops = segments.map((segment, index) => `${segment.color} ${index * size}deg ${(index + 1) * size}deg`);
  return `conic-gradient(from 0deg, ${stops.join(", ")})`;
}

function segmentMarkerStyle(index: number, count: number, rotation: number, duration: number): CSSProperties {
  const radians = (index + 0.5) * (2 * Math.PI / count);
  return {
    left: `${50 + 34 * Math.sin(radians)}%`,
    top: `${50 - 34 * Math.cos(radians)}%`,
    transform: `translate(-50%, -50%) rotate(${-rotation}deg)`,
    transition: `transform ${duration}ms cubic-bezier(0.12, 0.72, 0.08, 1)`,
  };
}

function wheelLabel(segments: readonly WheelSegment[]) {
  return `抽奖转盘：${segments.map((segment) => `${segment.label} ${formatProbability(segment.probability)}`).join("，")}`;
}

function formatProbability(value: number) { return `${Number(value.toFixed(2))}%`; }
function reducedMotion() { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
function waitForSpin(duration: number) { return duration ? new Promise<void>((resolve) => window.setTimeout(resolve, duration)) : Promise.resolve(); }
