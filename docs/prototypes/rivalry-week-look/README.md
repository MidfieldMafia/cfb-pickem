# Prototype: the Rivalry Week Look (#585)

Throwaway. Never merge this branch.

Canvas: https://claude.ai/artifact/Lpp1dzdfBq1zSJuj5vB2sS (private, built on the "Saturday Slate Design System" Artifact).

The question: what does the Rivalry Week Look look like on every screen, and where does a rivalry or trophy name sit on a Picks row and in the game sheet?

`project/` holds the canvas's own files: the index and five boards. Each board is one screen, with four phones at 360px: Today, then directions A, B and C.

- A · The banner: no tokens change. A rust RIVALRY WEEK band sits under every header, and rivalry names are rust caps labels.
- B · The paper: one class overrides 8 paper tokens (rust darkened to #9c4314 so caps labels pass 4.5:1 on muted). Rivalry names are rust outline pills. The trophy shows only in the game sheet.
- C · The program: a pine laces strip runs across the top of every screen. Rivalry games are billed in Chivo display type, with "For the <trophy>" under the name.

The design system's files (`project/ds/`) were copied server-side and are not in git.
