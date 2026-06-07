- scrollbar scrolling closes popover.
- noTransitionOut = true
- compose transitions breaks arrow
- support ring/shadow
- Popover line 272 use cls
- effectivesied for Popover line 86

- Arrow smartly adjusts to effective placement so arrow always points to anchor, even when the popover is flipped or shifted. It also smartly mirrors Popover's tailwind classes for `bg-[color]`, `border-[width]`, `border-[color]`, `ring-[size]`, `ring-[color]` and `shadow-[size]` and applies them to the arrow for consitency. Darkmode adjustments are also automatically handled.
- 