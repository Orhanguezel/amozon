function getFlagValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1]?.trim();
  return value && !value.startsWith('--') ? value : null;
}

function printUsage(): void {
  console.error([
    'Usage:',
    '  bun run start -- <jobId>',
    '  bun run scan -- --job-id <jobId>',
    '  bun run scan -- --keyword "thermal labels" --marketplace com',
  ].join('\n'));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const keyword = getFlagValue(args, '--keyword');
  const marketplace = getFlagValue(args, '--marketplace') ?? 'com';
  const explicitJobId = getFlagValue(args, '--job-id');

  const jobId = explicitJobId ?? args.find((arg) => !arg.startsWith('--'))?.trim();

  const [{ runAmazonJob }, { createJob, getJob }, { pool }] = await Promise.all([
    import('./amazon/amazon.job'),
    import('./db/job-store'),
    import('./db/client'),
  ]);

  if (keyword) {
    const job = await createJob(keyword, marketplace);
    console.log(`Amazon job created: ${job.id} (${keyword}, ${marketplace})`);
    await runAmazonJob(job.id);
    await printFinalJobStatus(job.id, getJob);
    await pool.end();
    return;
  }

  if (!jobId) {
    printUsage();
    process.exit(1);
  }

  await runAmazonJob(jobId);
  await printFinalJobStatus(jobId, getJob);
  await pool.end();
}

async function printFinalJobStatus(
  jobId: string,
  getJob: (jobId: string) => Promise<{ status: string; error_msg?: string | null } | null>,
): Promise<void> {
  const job = await getJob(jobId);
  if (job?.status === 'failed') {
    throw new Error(job.error_msg ? `JOB_FAILED: ${job.error_msg}` : 'JOB_FAILED');
  }
  console.log(`Amazon job completed: ${jobId}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
  console.error(`Amazon job failed: ${message}`);
  process.exit(1);
});
