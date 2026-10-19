import { Encoder, Profile } from "@garmin/fitsdk";
import { describe, expect, it } from "vitest";
import { isFit, parseFit } from "@/lib/import/fit";
import { expectCanonical } from "../fixtures/expect-canonical";
import { fitActivity } from "../fixtures/fit";

describe("FIT (written by Garmin's reference encoder)", () => {
  it("running activity: full parity with the canonical run", async () => {
    const run = await parseFit(fitActivity());
    expectCanonical(run);
    expect(run?.source).toBe("garmin");
    expect(run?.details?.calories).toBe(702);
  });

  it("brand comes from the file's manufacturer", async () => {
    expect((await parseFit(fitActivity({ manufacturer: "coros" })))?.source).toBe("coros");
    expect((await parseFit(fitActivity({ manufacturer: "suunto" })))?.source).toBe("suunto");
  });

  it("treadmill runs are flagged as indoor", async () => {
    expect((await parseFit(fitActivity({ subSport: "treadmill" })))?.indoor).toBe(true);
  });

  it("skips other sports and non-activity files", async () => {
    expect(await parseFit(fitActivity({ sport: "cycling" }))).toBeNull();
    const monitoring = new Encoder();
    monitoring.onMesg(Profile.MesgNum.FILE_ID, { type: "monitoringB", manufacturer: "garmin", product: 1, timeCreated: new Date() } as unknown as Parameters<Encoder["onMesg"]>[1]);
    expect(await parseFit(monitoring.close())).toBeNull();
  });

  it("rejects bytes that aren't FIT", async () => {
    const junk = new TextEncoder().encode("<gpx>not a fit file</gpx>");
    expect(isFit(junk)).toBe(false);
    expect(await parseFit(junk)).toBeNull();
  });
});
