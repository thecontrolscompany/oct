import 'dotenv/config';
import { refreshArchiveNameMaps } from '../sctArchive';

export async function main(): Promise<void> {
  console.log(`Querying ${process.env.CCT_ARCHIVE_DB ?? 'DaytonaState'} via sqlcmd...`);
  const result = await refreshArchiveNameMaps();
  console.log(`Wrote ${result.classMapCount} class maps to ${result.byClassPath}`);
  console.log(`Wrote ${result.globalNameCount} global names to ${result.globalPath}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
