export class ParentChildLinkRequiredError extends Error {
  readonly code = "family_link_required";

  constructor() {
    super("The parent is not linked to this child.");
    this.name = "ParentChildLinkRequiredError";
  }
}
