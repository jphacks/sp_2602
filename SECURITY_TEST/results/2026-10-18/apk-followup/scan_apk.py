import zipfile, re, hashlib, pathlib, sys, math, collections
apk=pathlib.Path(sys.argv[1])
patterns={'private_key_pem':re.compile(rb'-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----'),'aws_access_key_id':re.compile(rb'\bAKIA[0-9A-Z]{16}\b'),'google_service_account_key':re.compile(rb'"type"\s*:\s*"service_account"'),'credential_assignment':re.compile(rb'(?i)(?:client_secret|api_secret|secret_key|access_token|refresh_token|private_key)\s*["\'\s:=]{1,8}[A-Za-z0-9_./+=-]{12,}'),'jwt_like':re.compile(rb'\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b')}
summary={k:{'entries':set(),'hits':0} for k in list(patterns)+['high_entropy_long_ascii']}; types={}
with zipfile.ZipFile(apk) as z:
 infos=z.infolist()
 for info in infos:
  name=info.filename; data=z.read(info); ext=name.rsplit('.',1)[-1].lower() if '.' in name else '(no extension)'; types[ext]=types.get(ext,0)+1
  for k,p in patterns.items():
   hits=list(p.finditer(data))
   if hits: summary[k]['entries'].add(name); summary[k]['hits']+=len(hits)
  for m in re.finditer(rb'[A-Za-z0-9_+/=-]{40,}',data):
   s=m.group(0); counts=collections.Counter(s); ent=-sum((n/len(s))*math.log2(n/len(s)) for n in counts.values())
   if ent>=5.2: summary['high_entropy_long_ascii']['entries'].add(name); summary['high_entropy_long_ascii']['hits']+=1
print('apk_sha256='+hashlib.sha256(apk.read_bytes()).hexdigest().upper()); print('archive_entries='+str(len(infos))); print('file_types='+','.join(f'{k}:{v}' for k,v in sorted(types.items())))
for k,v in summary.items():
 print(f'{k}_hits={v["hits"]}; entries={len(v["entries"])}')
 for name in sorted(v['entries']): print('  '+name)
