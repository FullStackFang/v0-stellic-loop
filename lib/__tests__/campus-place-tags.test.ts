// @vitest-environment node
import {expect,it} from 'vitest';
import {PLACES_REQUIRED,placeFor,placeTag} from '@/lib/campus/place-tags';

// Spec: openspec/changes/campus-plan-place-and-time/specs/campus-listings (design D3, D4).
const southpoint={name:'Southpoint Park',otherNames:['southpoint']},lighthouse={name:'Lighthouse Park',otherNames:['lighthouse','Lighthouse']};
const cafe={name:'The Café at Cornell Tech',otherNames:[]};

it("gives a place its first other name as its @name, else its name as a tag",()=>{
 expect(placeTag(southpoint)).toBe('southpoint');
 expect(placeTag(cafe)).toBe('the-cafe-at-cornell-tech');
 expect(placeTag({name:'Bloomberg Center',otherNames:['Emma and Georgina Bloomberg Center']})).toBe('emma-and-georgina-bloomberg-ce');
});
it('finds the place an @ names, and nothing for an @ that is not a place',()=>{
 expect(placeFor([southpoint,lighthouse],'southpoint')).toBe(southpoint);
 expect(placeFor([southpoint,lighthouse],'@Lighthouse')).toBe(lighthouse);
 expect(placeFor([southpoint,lighthouse],'rooftop')).toBeNull();
 expect(placeFor([southpoint],null)).toBeNull();
});
it('needs places on Cornell Tech only',()=>{
 expect(PLACES_REQUIRED.has('cornell-tech')).toBe(true);
 expect(PLACES_REQUIRED.has('cornell')).toBe(false);
});
