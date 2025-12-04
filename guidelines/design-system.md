# Design System Guidelines

This document defines the visual design standards, color system, typography, and component patterns for the Agent Marketplace frontend applications.

---

## Design Principles

1. **Dark Mode First**: All interfaces default to dark theme
2. **Consistency**: Use design tokens, not raw values
3. **Accessibility**: WCAG AA compliance for contrast ratios
4. **Responsive**: Mobile-first responsive design
5. **Performance**: Minimal animations, optimized rendering

---

## Color System

### Neutral Palette (Backgrounds & Text)

```css
/* Dark backgrounds (most used) */
--neutral-950: #140b12;  /* Deepest background, app background */
--neutral-900: #1f161d;  /* Dark background, modal backgrounds */
--neutral-800: #2b2229;  /* Card/input background */
--neutral-700: #3f343c;  /* Borders, dividers */

/* Text colors */
--neutral-600: #685962;  /* Dark text */
--neutral-500: #907e88;  /* Muted text */
--neutral-400: #b0a1a0;  /* Secondary labels, placeholders */
--neutral-300: #d1c4b7;  /* Mid-light, focused borders */
--neutral-200: #e6dbc7;  /* Light accents */
--neutral-100: #fcf2d7;  /* Very light */
--neutral-50: #ffffff;   /* White (primary text) */
```

### Brand Colors

**Primary (Pink/Magenta)**
```css
--primary-500: #f5557f;  /* Main brand color */
--primary-600: #e5004a;  /* Hover state */
--primary-300: #ff80b0;  /* Light variant */
```

**Secondary (Purple)**
```css
--secondary-500: #B079F4;  /* Secondary accent */
--secondary-900: #382A4A;  /* Dark purple (gradients) */
--secondary-950: #292034;  /* Darkest purple */
```

### Semantic Colors

```css
--success-500: #43eba3;  /* Positive actions, confirmations */
--warning-500: #ebb643;  /* Caution, alerts */
--danger-400: #f37959;   /* Error text */
--danger-500: #f3793c;   /* Destructive actions */
--danger-600: #e5004a;   /* Error borders */
```

---

## Typography

### Font Stack

**Primary**: System fonts (Inter, SF Pro, etc.)
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif;
```

**Monospace** (code):
```css
font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
```

### Type Scale

| Class | Size | Use Case |
|-------|------|----------|
| `text-2xl` | 24px | Section titles |
| `text-xl` | 20px | Card headlines |
| `text-lg` | 18px | Form labels, emphasized text |
| `text-base` | 16px | Body text, primary content |
| `text-sm` | 14px | Secondary text, captions |
| `text-xs` | 12px | Metadata, badges |

### Font Weights

| Weight | Class | Usage |
|--------|-------|-------|
| 700 | `font-bold` | Headlines, buttons |
| 600 | `font-semibold` | Sub-headings |
| 500 | `font-medium` | Form labels |
| 400 | `font-normal` | Body text |

---

## Spacing System

Uses 4px increment scale (Tailwind default).

### Common Patterns

```css
/* Padding */
p-2: 8px    /* Small padding */
p-3: 12px   /* Form inputs */
p-4: 16px   /* Standard card/container */
p-6: 24px   /* Large container */

/* Gap (flexbox/grid) */
gap-2: 8px   /* Standard gap */
gap-3: 12px  /* Buttons, form elements */
gap-4: 16px  /* Section spacing */

/* Margin */
mb-2: 8px   /* Form field spacing */
mb-4: 16px  /* Standard spacing */
mb-6: 24px  /* Section spacing */
```

---

## Border Radius

| Class | Value | Usage |
|-------|-------|-------|
| `rounded-sm` | 4px | Small elements |
| `rounded` | 6px | Default |
| `rounded-lg` | 8px | Modal handles |
| `rounded-xl` | 12px | Input fields |
| `rounded-2xl` | 16px | Cards |
| `rounded-full` | 50% | Circles, badges, buttons |

---

## Component Patterns

### Buttons

```tsx
// Primary button
<button className="h-10 px-4 rounded-full bg-primary-500 text-white font-semibold hover:bg-primary-600 transition-colors">
  Submit
</button>

// Outline button
<button className="h-10 px-4 rounded-full border border-neutral-400 bg-transparent text-neutral-100 hover:bg-neutral-800 transition-colors">
  Cancel
</button>

// Ghost button
<button className="h-10 px-4 rounded-full bg-transparent text-white hover:bg-neutral-800 transition-colors">
  Close
</button>

// Disabled state
<button className="h-10 px-4 rounded-full bg-neutral-800 text-neutral-600 cursor-not-allowed" disabled>
  Disabled
</button>
```

### Inputs

```tsx
// Default input
<input
  className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-base text-white placeholder:text-neutral-400 focus:border-neutral-300 focus:outline-none transition-colors"
  placeholder="Enter text..."
/>

// Error state
<input
  className="w-full rounded-xl border border-danger-600 bg-neutral-800 px-4 py-3 text-base text-white"
/>
<span className="text-sm text-danger-400 mt-1">Error message</span>
```

### Cards

```tsx
// Standard card
<div className="rounded-2xl bg-neutral-800 p-4">
  <h3 className="text-lg font-semibold text-white">Title</h3>
  <p className="text-sm text-neutral-400 mt-2">Description</p>
</div>

// Gradient card
<div className="rounded-2xl bg-gradient-to-br from-neutral-800 to-neutral-900 p-4">
  {/* content */}
</div>
```

### Modals

```tsx
// Modal container
<div className="fixed inset-0 bg-black/50 flex items-center justify-center">
  <div className="bg-neutral-900 rounded-2xl p-6 max-w-md w-full mx-4">
    <h2 className="text-xl font-bold text-white mb-4">Modal Title</h2>
    {/* content */}
  </div>
</div>
```

### Badges

```tsx
// Primary badge
<span className="rounded-full bg-primary-500 px-3 py-1 text-xs font-bold text-white uppercase tracking-wide">
  New
</span>

// Outlined badge
<span className="rounded-full border border-neutral-400 bg-transparent px-3 py-1 text-xs text-neutral-100">
  Status
</span>
```

---

## Dark Mode Implementation

### Always Dark Classes

```tsx
// Background hierarchy
bg-neutral-950  // App background
bg-neutral-900  // Modal/section background
bg-neutral-800  // Card/input background

// Text hierarchy
text-white      // Primary text
text-neutral-100 // Secondary text
text-neutral-400 // Muted text, placeholders
text-neutral-600 // Disabled text

// Borders
border-neutral-700  // Default border
border-neutral-300  // Focus border
border-danger-600   // Error border
```

### Do's and Don'ts

**Do:**
```tsx
className="bg-neutral-800 text-white"
```

**Don't:**
```tsx
className="bg-white text-black"  // No light theme classes
className={isDark ? 'bg-neutral-800' : 'bg-white'}  // No conditional themes
```

---

## Accessibility

### Contrast Requirements

| Combination | Contrast | Status |
|-------------|----------|--------|
| White on neutral-800 | 9.8:1 | Pass |
| White on neutral-900 | 10.5:1 | Pass |
| Neutral-400 on neutral-800 | 3.2:1 | Pass (large text) |
| Neutral-600 on neutral-800 | 1.8:1 | Disabled only |

### Focus States

```tsx
// Always visible focus ring
className="focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-neutral-900"
```

### Touch Targets

```tsx
// Minimum 44x44px hit area
className="min-h-[44px] min-w-[44px]"
```

---

## Animation Guidelines

### Duration Scale

| Duration | Usage |
|----------|-------|
| 75ms | Micro-interactions (opacity changes) |
| 150ms | Quick transitions (color, border) |
| 200ms | Standard transitions |
| 300ms | Modal/drawer animations |

### Easing

```css
transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);  /* ease-out */
```

### Common Transitions

```tsx
// Color transitions
className="transition-colors duration-150"

// Transform transitions
className="transition-transform duration-200"

// All transitions
className="transition-all duration-200"
```

---

## Responsive Breakpoints

```css
sm: 640px   /* Small devices */
md: 768px   /* Tablets */
lg: 1024px  /* Laptops */
xl: 1280px  /* Desktops */
2xl: 1536px /* Large screens */
```

### Mobile-First Pattern

```tsx
<div className="p-4 md:p-6 lg:p-8">
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {/* content */}
  </div>
</div>
```

---

## File Organization

```
src/
├── components/
│   ├── ui/           # Base UI components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── card.tsx
│   │   └── index.ts  # Barrel exports
│   └── features/     # Feature-specific components
├── styles/
│   └── globals.css   # Global styles, CSS variables
└── lib/
    └── cn.ts         # Class name utility (clsx + twMerge)
```

### Naming Conventions

- **Files**: kebab-case (`character-card.tsx`)
- **Components**: PascalCase (`CharacterCard`)
- **Props**: PascalCase + Props (`CharacterCardProps`)
- **CSS classes**: kebab-case (Tailwind default)
