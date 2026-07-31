import { Effect } from "effect"
import type { DatabaseMigration } from "../../migration"

export default {
  id: "20260731120541_gate08_message_diff_projection",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`message\` ADD \`summary_diffs\` text;`)
      yield* tx.run(`
        UPDATE \`message\`
        SET \`summary_diffs\` = json_extract(\`data\`, '$.summary.diffs')
        WHERE json_type(\`data\`, '$.summary.diffs') = 'array';
      `)
    })
  },
} satisfies DatabaseMigration.Migration
