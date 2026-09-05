import { describe, expect, it } from "vitest";
import { compareRealityToDesign, validateComparisonReport, type DesignElement, type RealityElement } from "./comparison.js";
const evidence=(label:string)=>({contentHash:`${label}-hash`,label,epistemic:"INFERRED" as const});
const d=(o:Partial<DesignElement>={})=>({designId:"D-1",kind:"wall",position:{x:0,y:0,z:0},size:1,provenance:[evidence("d")],...o});
const r=(o:Partial<RealityElement>={})=>({realityId:"R-1",kind:"wall",position:{x:.01,y:0,z:0},size:1.01,provenance:[evidence("r")],...o});
describe("AISE-029",()=>{
 it("passes and validates",()=>{const x=compareRealityToDesign({unit:"meter",design:[d()],reality:[r()]});expect(x.status).toBe("PASS");expect(x.correspondences).toHaveLength(1);expect(()=>validateComparisonReport(x)).not.toThrow();});
 it("reports position and size mismatch",()=>{const x=compareRealityToDesign({unit:"meter",design:[d()],reality:[r({position:{x:.1,y:0,z:0},size:1.2})],correspondenceTolerance:.2});expect(x.status).toBe("MISMATCH");expect(x.mismatches.map(m=>m.kind).sort()).toEqual(["position","size"]);});
 it("fails closed on ambiguity",()=>{const x=compareRealityToDesign({unit:"meter",design:[d()],reality:[r({realityId:"R-1",position:{x:.1,y:0,z:0}}),r({realityId:"R-2",position:{x:-.1,y:0,z:0}})],correspondenceTolerance:.2});expect(x.status).toBe("AMBIGUOUS");expect(x.correspondences).toHaveLength(0);expect(x.unmatchedDesign).toEqual(["D-1"]);expect(x.unmatchedReality).toEqual(["R-1","R-2"]);});
 it("uses quantity-specific uncertainty",()=>{const x=compareRealityToDesign({unit:"meter",design:[d({positionUncertainty:.2})],reality:[r({position:{x:.1,y:0,z:0},positionUncertainty:.2,size:1.12,sizeUncertainty:.1})],correspondenceTolerance:.2});expect(x.status).toBe("PASS");});
 it("requires provenance",()=>{expect(()=>compareRealityToDesign({unit:"meter",design:[d({provenance:[]})],reality:[r()]})).toThrow(/provenance/);});
 it("is order independent",()=>{const a=compareRealityToDesign({unit:"meter",design:[d({designId:"D-2"}),d({designId:"D-1"})],reality:[r({realityId:"R-2"}),r({realityId:"R-1"})]});const b=compareRealityToDesign({unit:"meter",design:[d({designId:"D-1"}),d({designId:"D-2"})],reality:[r({realityId:"R-1"}),r({realityId:"R-2"})]});expect(b).toEqual(a);});
 it("rejects digest tampering",()=>{const x=compareRealityToDesign({unit:"meter",design:[d()],reality:[r()]});expect(()=>validateComparisonReport({...x,status:"MISMATCH"})).toThrow(/digest/);});
});
