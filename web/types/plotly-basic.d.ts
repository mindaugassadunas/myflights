declare module "plotly.js-basic-dist-min" {
  import type { PlotlyHTMLElement, Data, Layout, Config } from "plotly.js";
  function newPlot(
    root: HTMLElement,
    data: Data[],
    layout?: Partial<Layout>,
    config?: Partial<Config>,
  ): Promise<PlotlyHTMLElement>;
  function react(
    root: HTMLElement,
    data: Data[],
    layout?: Partial<Layout>,
    config?: Partial<Config>,
  ): Promise<PlotlyHTMLElement>;
  function purge(root: HTMLElement): void;
  function relayout(root: HTMLElement, layout: Partial<Layout>): Promise<PlotlyHTMLElement>;

  const Plotly: {
    newPlot: typeof newPlot;
    react: typeof react;
    purge: typeof purge;
    relayout: typeof relayout;
  };
  export default Plotly;
}
