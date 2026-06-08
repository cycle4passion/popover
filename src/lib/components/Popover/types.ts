import type { TransitionConfig } from 'svelte/transition';

export type TransitionFn = (node: Element, params?: Record<string, unknown>) => TransitionConfig;
export type Side = 'top' | 'bottom' | 'left' | 'right';
export type Placement = Side | `${Side}-${'start' | 'end'}`;
export type TriggerBy = 'click' | 'hover';
