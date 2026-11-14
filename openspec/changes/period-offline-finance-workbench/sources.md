# Research and evidence

Reviewed 2026-11-08. These are primary references supporting the design, not evidence that a live application has passed parity tests.

## Calculator

- [Baiiplus calculator](https://baiiplus.com/): visible key layout, worksheets and outputs; the site's own description states it is unfinished and not exact BA II Plus behavior.
- [Baiiplus CHAIN/AOS article](https://baiiplus.com/articles/understanding-chain-vs-aos-calculation-methods): website calculation-mode workflow.
- [TI BA II Plus guide](https://education.ti.com/download/en/ed-tech/ADF11FB65B284B6195B0A7E9502784BA/5DC3E70F3C8040E499D704B583646E1D/BA_II_PLUS_EN.pdf): baseline operating and financial behavior.
- [TI BA II Plus Professional guide](https://education.ti.com/download/en/ed-tech/6D4382031E7640378E9B05B81AECBCF7/8A3EF44EF00C4C41A0D14411EA589D1F/BAIIPLUSPROGuidebook_EN.pdf): Professional-style additional outputs. Verify rate conventions separately for modified IRR, NFV, payback and duration.

The calculator agent inspected website/manual content but did not run a live keystroke comparison. All proposed sequences remain test specifications until executed on the reference and implementation. Do not describe the current prototype as near-parity.

## DCF

- [CFA Institute: Free Cash Flow Valuation](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/free-cash-flow-valuation): FCFF discounted at WACC, EBIT-based cash-flow construction, and nonoperating-asset adjustments. The design adopts this enterprise-valuation model.
- [Aswath Damodaran, NYU Stern: Valuation Inputs](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/lectures/dcfinput.html): discount-rate inputs, cost of equity/debt, capital weights and consistent valuation assumptions. The design uses entered market/target weights rather than making WACC circular with calculated equity value.
- [Aswath Damodaran, NYU Stern: Estimating Terminal Value](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/valquestions/termvalapproaches.htm): stable-growth and multiple-based terminal approaches. The design labels exit multiples as an externally chosen relative-valuation assumption and requires sustainable terminal FCFF to be considered explicitly.

The negative-EBIT tax default, annual-only first release, 1–20-year forecast range, validations, artifact behavior and staging are product design choices. They are not claims that the references prescribe these software constraints.

## Desktop and assistant

- [LLM Wiki source review](llm-wiki-review.md): inspected native Claude Code/Codex bridges, MCP/local API integration, project pinning and backend session storage. The review distinguishes observed upstream behavior from Period's proposed session policy. Direct API references below are background, not first-release adapter requirements.

- [Tauri capabilities](https://v2.tauri.app/security/capabilities/): scope native access to trusted app windows and necessary commands.
- [Anthropic tool-use contract](https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works): model requests structured actions; the application executes tools and supplies results.
- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling): app-owned tool execution. The spec keeps actual financial computation outside model-generated prose.

No provider credentials were used, no paid request was issued, and no desktop package was built as part of this specification task.

## Numerical fixture provenance

Fixture cash flows are synthetic examples created for this project. Forecast arithmetic and present values were independently calculated by the DCF research agent using tool execution. They are not a valuation recommendation for any company. The implementation tests must store the expected constants, formula assumptions, currency scale and tolerance explicitly rather than deriving expected values from the engine under test.
