import { Type } from "typebox";

export default function fixtureExtension(pi) {
  pi.registerTool({
    name: "fixture_echo",
    label: "Fixture Echo",
    description: "Echo deterministic text for the Repa Application acceptance test.",
    parameters: Type.Object({ message: Type.String() }),
    async execute(_toolCallId, parameters) {
      return {
        content: [{ type: "text", text: `fixture:${parameters.message}` }],
        details: { message: parameters.message },
      };
    },
  });
}
