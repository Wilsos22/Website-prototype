# Abbie's Classroom Plugin

A context capsule + lesson-database builder for the Big Dog Math classroom OS.

Installing this plugin means: any new Claude conversation about the site instantly understands what you've built, your teaching philosophy, the Notion schema, and the control panel state sequence — without you re-explaining.

## What's inside

### Skills

- **`classroom-os-context`** — Auto-loads whenever you mention the classroom site, lesson page, control panel, warm-up, Abbie, Notion lessons db, etc. Contains the project map, Notion schema, tech stack, design system, philosophy, and tone notes.
- **`lesson-database-builder`** — When invoked, generates lesson entries that match the Notion "Math 6 Lessons" schema exactly (Date, Publish Workflow, Supply:/Tool: checkboxes, Warm Up Link / Exit Ticket Link relations, agenda) and align with the control panel's state sequence.

## Install

Drop the `.plugin` file into Cowork and click install.

## Update later

When the site changes (new pages, new Notion fields, new control panel states), tell Claude "update the classroom OS context" and it'll edit `skills/classroom-os-context/SKILL.md` in place. Rezip and reinstall.
