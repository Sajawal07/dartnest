import { describe, it, expect } from 'vitest';
import { PROJECTS } from '../src/data/projects';
import { grade } from '../src/engine/harness';

describe('Project-based learning', () => {
  it('has 15 projects (5 beginner, 5 intermediate, 5 advanced) and a capstone', () => {
    expect(PROJECTS).toHaveLength(15);
    for (const lvl of ['Beginner', 'Intermediate', 'Advanced']) expect(PROJECTS.filter((p) => p.level === lvl)).toHaveLength(5);
    const cap = PROJECTS.find((p) => p.capstone)!;
    for (const skill of ['Navigation', 'State management', 'Persistence', 'Validation', 'Error handling', 'Responsive design', 'Testing']) expect(cap.skills).toContain(skill);
  });
  it('every project has spec, milestones summing to 100, starter, tests, hints and rubric', () => {
    for (const p of PROJECTS) {
      expect(p.summary.length).toBeGreaterThan(20);
      expect(p.requirements.length).toBeGreaterThan(0);
      expect(p.rubric.length).toBeGreaterThan(1);
      expect(p.milestones.reduce((a, m) => a + m.weight, 0)).toBe(100);
      for (const m of p.milestones) { expect(m.task.starter.length).toBeGreaterThan(10); expect(m.task.tests.length).toBeGreaterThan(0); expect(m.task.hints.length).toBeGreaterThan(0); }
    }
  });
  for (const p of PROJECTS) for (const m of p.milestones) {
    it(`${p.id} / ${m.task.id}: reference solution scores 100 and starter does not pass`, () => {
      const r = grade(m.task, m.task.solution);
      expect(r.breakdown.filter((b) => !b.passed).map((b) => `${b.name}: ${b.detail}`)).toEqual([]);
      expect(r.score).toBe(100);
      expect(grade(m.task, m.task.starter).passed).toBe(false);
    });
  }
});
