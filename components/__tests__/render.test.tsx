import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IdentityFields } from "../IdentityFields";
const ident = {name:"",phone:"",code:""};
describe("IdentityFields", () => {
  it("shows nothing with a cookie", () => {
    const { container } = render(<IdentityFields signedIn stage="identity" value={ident} onChange={() => {}} onSubmit={() => {}} cta="I'm in" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows name and number without a cookie", () => {
    render(<IdentityFields signedIn={false} stage="identity" value={ident} onChange={() => {}} onSubmit={() => {}} cta="I'm in" />);
    expect(screen.getByLabelText("Your name")).toBeInTheDocument();
    expect(screen.getByLabelText("Your number")).toBeInTheDocument();
  });

  it("shows the code field when the number is known", () => {
    render(<IdentityFields signedIn={false} stage="code" value={ident} onChange={() => {}} onSubmit={() => {}} cta="I'm in" />);
    expect(screen.getByLabelText("Code")).toBeInTheDocument();
    expect(screen.queryByLabelText("Your name")).toBeNull();
  });
});
