// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { collegeNamed, findColleges } from '@/lib/campus/colleges';

// The list of US colleges "Sign up my school" searches (lib/campus/us-colleges.json, built by scripts/us-colleges.cjs).
describe('the list of US colleges', () => {
  it('finds a school by a short name people use, ahead of anything else', () => {
    expect(findColleges('umich').found[0]).toEqual({ label: 'University of Michigan-Ann Arbor', where: 'Ann Arbor, MI', domain: 'umich.edu' });
    expect(findColleges(' NYU ').found[0].label).toBe('New York University');
    expect(findColleges('penn state').found[0].label).toBe('Pennsylvania State University-Main Campus');
  });
  it('finds schools by the start of each word typed, the larger first, and says how many there are', () => {
    const michigan = findColleges('michigan');
    expect(michigan.found).toHaveLength(5);
    expect(michigan.total).toBeGreaterThan(5);
    expect(michigan.found.map(each => each.label)).toContain('University of Michigan-Ann Arbor');
    expect(findColleges('univ of mich ann').found.map(each => each.label)).toEqual(['University of Michigan-Ann Arbor']);
    expect(findColleges('The Ohio State').found[0].label).toBe('Ohio State University-Main Campus');
    expect(findColleges('st johns').found[0].label).toBe("St. John's University-New York");
  });
  it('finds nothing for one letter, for a school abroad, or for no school at all', () => {
    for (const typed of ['m', '', 'McGill University', 'asdf']) expect(findColleges(typed)).toEqual({ found: [], total: 0 });
  });
  it('knows a school by its exact name whatever the capitals, and tells two of one name apart by town', () => {
    expect(collegeNamed('  cornell   UNIVERSITY ')?.label).toBe('Cornell University');
    expect(collegeNamed('Cornell')).toBeNull();
    const twins = findColleges('Columbia College').found.filter(each => each.label.startsWith('Columbia College ('));
    expect(twins.length).toBeGreaterThan(1);
    for (const each of twins) expect(collegeNamed(each.label)).toEqual(each);
    expect(findColleges(twins[0].label)).toEqual({ found: [twins[0]], total: 1 });
  });
});
