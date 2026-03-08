let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  const j = JSON.parse(d);
  const ok = j.results.filter(r => r.items > 0).length;
  const err = j.results.filter(r => r.error).length;
  const zero = j.results.filter(r => !r.error && r.items === 0).length;
  console.log('Feeds processed:', j.feeds_processed);
  console.log('Working:', ok, '| Errors:', err, '| Empty:', zero);
  console.log('New items:', j.new_items);
  console.log('');
  if (err > 0) {
    console.log('Sample errors:');
    j.results.filter(r => r.error).slice(0, 15).forEach(r => console.log(' ', r.name, '-', r.error));
  }
});
