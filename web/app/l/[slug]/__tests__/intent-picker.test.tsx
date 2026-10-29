import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { IntentPicker } from "@/app/l/[slug]/intent-picker";

afterEach(cleanup);

function renderPicker(props: Partial<Parameters<typeof IntentPicker>[0]> = {}) {
  return render(
    <form>
      <IntentPicker initial="crew_conditional" {...props} />
    </form>,
  );
}

const radio = (name: RegExp) => screen.getByRole("radio", { name }) as HTMLInputElement;
const button = () => screen.getByRole("button") as HTMLButtonElement;

describe("IntentPicker", () => {
  it("preselects crew_conditional and reads 'In if there's a crew'", () => {
    renderPicker();
    expect(radio(/In if there's a crew/).checked).toBe(true);
    expect(button().textContent).toBe("In if there's a crew");
  });

  it("changes the button label for each of the three choices", () => {
    renderPicker();

    fireEvent.click(radio(/Going anyway, add me to a crew/));
    expect(button().textContent).toBe("Going anyway, add me to a crew");

    fireEvent.click(radio(/Keep me in the loop/));
    expect(button().textContent).toBe("Keep me in the loop");

    fireEvent.click(radio(/In if there's a crew/));
    expect(button().textContent).toBe("In if there's a crew");
  });

  it("shows the RSVP sub-line under going_want_crew only", () => {
    const { container } = renderPicker();
    const subline = "Already RSVPed on Luma or Partiful? Get a crew so you don't walk in alone.";
    expect(container.textContent).toContain(subline);
    expect(radio(/Going anyway/).closest("label")?.textContent).toContain(subline);
    expect(radio(/In if there's a crew/).closest("label")?.textContent).not.toContain("Already RSVPed");
    expect(radio(/Keep me in the loop/).closest("label")?.textContent).not.toContain("Already RSVPed");
  });

  it("pins the label when submitLabel is given and focuses the checked radio on request", () => {
    renderPicker({ initial: "watching", submitLabel: "Save", autoFocus: true });
    expect(button().textContent).toBe("Save");
    expect(document.activeElement).toBe(radio(/Keep me in the loop/));
    fireEvent.click(radio(/Going anyway/));
    expect(button().textContent).toBe("Save");
  });
});
