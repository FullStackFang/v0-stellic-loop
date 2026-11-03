import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { IntentComposer } from "../IntentComposer";
function Composer() { const [raw,setRaw]=useState("Dinner Thursdays @ramen @after 7"); return <IntentComposer value={raw} onChange={setRaw} days={["2026-11-05"]} />; }
it("edits a preference and returns focus to the freeform input", () => {
  render(<Composer/>);
  fireEvent.click(screen.getByRole("button",{name:"Edit preference @ramen"}));
  const editor=screen.getByLabelText("Preference",{selector:"input"});
  expect(editor).toHaveFocus();
  fireEvent.change(editor,{target:{value:"quiet place"}});
  fireEvent.keyDown(editor,{key:"Enter"});
  expect(screen.getByRole("button",{name:"Edit preference @quiet place"})).toBeInTheDocument();
  expect(screen.getByRole("textbox",{name:"I’m up for"})).toHaveFocus();
  fireEvent.click(screen.getByRole("button",{name:"Remove preference quiet place"}));
  expect(screen.queryByRole("button",{name:"Edit preference @quiet place"})).not.toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Edit preference @after 7"})).toBeInTheDocument();
});
it("uses explicit day editing without submitting the form", () => {
  render(<Composer/>);
  fireEvent.click(screen.getByRole("button",{name:"Edit Day"}));
  const any=screen.getByRole("button",{name:"Any day"});
  expect(any).toHaveFocus(); fireEvent.click(any);
  expect(screen.getByRole("button",{name:"Edit Day"})).toHaveTextContent("Any day");
});
