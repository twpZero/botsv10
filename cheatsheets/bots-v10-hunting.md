# BOTS v10 Hunting Cheat Sheet

Nov 11, 2026 · @RED

## BOTS v10 at a glance

The Tokyo Regional runs BOTS v10 with six investigation scenarios plus an Easter egg set; the briefs below come from your portal pages. The briefs name the indexes but no sourcetypes, and the questions were not yet visible, so the reading of each scenario is still my inference from its brief.

| Item | What is confirmed | Source |
| --- | --- | --- |
| Debut | .conf25, Boston, September 2025 | [Splunk blog](https://www.splunk.com/en_us/blog/conf-splunklive/celebrate-10-years-of-boss-of-the-soc-at-conf25.html) |
| Story | You play Alice Bluebird at Frothly, a brewery that has added a hot dog food truck | [Splunk Community](https://community.splunk.com/t5/Community-Blog/Get-Ready-for-BOTS10-The-Legendary-Challenge-Returns-to-conf25/ba-p/750838) |
| Adversary | Angry Alpaca, the APT group first unveiled at .conf23 and also used in v9 | [CAE competitions list](https://cyber-atlas.caecommunity.org/competitions) |
| Size | Seven new scenarios, plus Easter egg questions where anything goes | [Worldwide BOTS Day](https://www.splunk.com/en_us/blog/security/2025-worldwide-bots-day.html) |
| Products | Splunk Enterprise, Enterprise Security, SOAR, Attack Analyzer, plus unnamed surprises | [GovSummit post](https://www.splunk.com/en_us/blog/industries/boss-of-the-soc-splunk-govsummit.html) |
| Terrain | Pivoting across cloud and on-prem data; OSINT is required for some answers | [Higher-ed recap](https://www.splunk.com/en_us/blog/industries/2026-national-higher-education-boss-of-the-soc-winner.html) |
| Format | About 4 hours; team size is set by the organiser (2 to 4 in Tokyo); every question has hints | [SNHU event page](https://events.snhu.edu/en/boss-of-the-soc-bots-cybersecurity-and-data-analytics-competition-2026-5a3NQU1ou4r) |
| Scoring (Tokyo, v9) | 100, 500 or 1,500 points per question; bonus for answering before a hint unlocks; wrong answers cost points | [Demae-can tech blog](https://techblog.demae-can.co.jp/entry/20251106/1762419255) |

Two things to check before the day:

- **Which version you are playing.** BOTS11 (Stillwater Collective versus Sable Vector) debuted at .conf26 in September 2026, while v10 is still used for regional and university events ([BOTS11 announcement](https://www.splunk.com/en_us/blog/conf-splunklive/boss-of-the-soc-conf26.html)).
- **What v9 looked like**, since v10 keeps the same seven-scenario shape. The Tokyo v9 report lists Splunk search, about 20 SOAR questions, Attack Analyzer, AWS logs, and Azure plus Windows logs for tracing an intrusion.

## The seven scenarios and where to hunt

Three of the six investigations are about trusted people (an MSP contractor, a remote developer, an insider), so expect questions on who did what with legitimate access more than on malware.

| # | Scenario | What the brief says | My reading (inference) | Closest Splunk research | Hunts |
| --- | --- | --- | --- | --- | --- |
| 1 | Cats and Dawgs | Frothly's promotional web game was breached; "legacy spaghetti services, custom logs" | Web application or API attack traced across several home-made services; custom sourcetypes with few extracted fields | Web shell and web exploitation posts | H18, H6, H14 |
| 2 | Hot Dog Heist: The Missing Mustard | An APT gained access "with precision", evaded prevention and exfiltrated the hot dog recipe and beer blueprints; the aftermath cites third-party risk and executive awareness training | Entry through a third party or a targeted executive phish, then a quiet endpoint intrusion ending in exfiltration | Loader, stealer and RAT posts; Okta post (the Midnight Blizzard post was the v9 theme, so it is unlikely to return) | H1, H3, H4, H5, H7, H9 |
| 3 | Hops of Deception | A new hire at the MSP Buttercup Security, brought in to scale Frothly's Splunk operations, probes internal systems as an insider; then "things escalated even further" | Recon done from inside Splunk and from MSP access, followed by a second, louder stage (unknown; ransomware or a wiper would fit) | Ransomware and wiper posts | H15, H5, H11 |
| 4 | Zero Chill | Marketing director Mallory Kraeusen, new remote developer Finn Wiggen ("maybe too quiet"), an ad partner gone dark, strange things on her computer; Splunk Enterprise then Attack Analyzer. Indexes: main and frothxly | A lure delivered through the compromised ad partner or the developer, detonated in Attack Analyzer; a fake remote-worker angle is likely | Fake CAPTCHA, Inno Setup and stealer posts | H19, H1, H2, H3, H13 |
| 5 | Threat Intel O'LLMa | Damo uses LLMs in a CI/CD pipeline to analyse threat advisories and shares his models with an adversary by mistake. Indexes: main and BOTS10 | A self-hosted LLM (the title points at Ollama) exposed or poisoned; questions on LLM risk categories are likely | SURGe's Defending LLMs work; STRT's Ollama add-on and Suspicious Ollama Activities story | H16 |
| 6 | Rogue Intentions | A competitor released an "unusually similar" flavour; "bleating insider threats". Indexes: main and BOTS10 | Insider theft of recipe files: access, staging, then exfiltration by upload, mail or removable media | Microsoft 365 email collection post | H17, H9, H7 |
| 7 | EGGS 10 | "You can't make an omelette without first breaking some eggs" | Easter eggs: trivia hidden in the data, dashboards and scenario text | None | Read closely |

Notes on the briefs:

- **Indexes.** Scenarios 4, 5 and 6 name main, frothxly and BOTS10. Copy the spelling from the question page on the day; in searches index names are lower case.
- **Splunk is itself evidence in scenario 3.** An MSP hired to run Splunk leaves its trail in Splunk's own audit logs (H15).
- **Scenario 5 corrects my first draft.** I had written that AI research came too late for v10; the brief shows v10 has a full LLM scenario.

## Splunk threat research, cross-checked against v10

Posts published before September 2025 are the ones that could have shaped v10, because the game shipped that month; they sit in the middle column. Later posts cannot be in v10, but they are the pool BOTS11 draws from. Coverage is the Splunk Threat Research Team (STRT) blog from late 2023 to the October 2026 recap; the hunt IDs point to the next section.

| Theme | Could be in v10 (published before Sept 2025) | Later (Sept 2025 to Oct 2026) | Hunt |
| --- | --- | --- | --- |
| Lures and delivery | [Fake CAPTCHA / ClickFix](https://www.splunk.com/en_us/blog/security/unveiling-fake-captcha-clickfix-attacks.html), [Inno Setup installers](https://www.splunk.com/en_us/blog/security/inno-setup-malware-redline-stealer-campaign.html) | [MSIX abuse](https://www.splunk.com/en_us/blog/security/msix-weaponization-threat-detection-splunk.html), [.msc loader](https://www.splunk.com/en_us/blog/security/mmc-msc-xml-malicious-loader-detection.html), [npm supply chain](https://www.splunk.com/en_us/blog/security/npm-supply-chain-attack-detection-analysis.html) | H1, H2 |
| Stealers, RATs, loaders | [XWorm](https://www.splunk.com/en_us/blog/security/xworm-shape-shifting-arsenal-detection-evasion.html), [Meduza](https://www.splunk.com/en_us/blog/security/meduza-stealer-analysis.html), [Braodo](https://www.splunk.com/en_us/blog/security/cracking-braodo-stealer-analyzing-python-malware-and-its-obfuscated-loader.html), [ValleyRAT](https://www.splunk.com/en_us/blog/security/valleyrat-insights-tactics-techniques-and-detection-methods.html), [infostealers against ISPs](https://www.splunk.com/en_us/blog/security/infostealer-campaign-against-isps.html), [DarkGate](https://www.splunk.com/en_us/blog/security/enter-the-gates-an-analysis-of-the-darkgate-autoit-loader.html), [Snake Keylogger](https://www.splunk.com/en_us/blog/security/under-the-hood-of-snakekeylogger-analyzing-its-loader-and-its-tactics-techniques-and-procedures.html), [Phemedrone](https://www.splunk.com/en_us/blog/security/unveiling-phemedrone-stealer-threat-analysis-and-detections.html) | [Castle RAT](https://www.splunk.com/en_us/blog/security/castlerat-malware-detection-splunk-mitre-attck.html), [Lokibot stego loader](https://www.splunk.com/en_us/blog/security/updated-net-steganography-loader-lokibot-malware-analysis.html), [Blank Grabber](https://www.splunk.com/en_us/blog/security/blankgrabber-trojan-stealer-analysis-detection.html), [Gh0st RAT](https://www.splunk.com/en_us/blog/security/detecting-ghost-rat-cloverplus-adware-loader-analysis.html), [VIP Keylogger](https://www.splunk.com/en_us/blog/security/behind-the-code-layered-defense-evasion-vip-keylogger.html), [Salat Stealer](https://www.splunk.com/en_us/blog/security/bundled-to-steal-salat-stealer-campaign.html), [Phantom Stealer](https://www.splunk.com/en_us/blog/security/phantom-stealer-shellcode-steganography-credential-theft.html) | H3, H4, H7 |
| Ransomware and wipers | [Termite](https://www.splunk.com/en_us/blog/security/termite-ransomware-analysis.html), [ShrinkLocker](https://www.splunk.com/en_us/blog/security/shrinklocker-malware-abusing-bitlocker-to-lock-your-data.html), [Handala wiper](https://www.splunk.com/en_us/blog/security/handalas-wiper-threat-analysis-and-detections.html), [AcidPour](https://www.splunk.com/en_us/blog/security/acidpour-wiper-malware-threat-analysis-and-detections.html) | [PromptLock](https://www.splunk.com/en_us/blog/artificial-intelligence/promptlock-llm-ransomware-security-analysis.html) | H11 |
| Web and edge exploitation | [SharePoint and IIS modules](https://www.splunk.com/en_us/blog/security/sharepoint-exploits-and-the-hidden-threat-of-iis-module-persistence.html), [CitrixBleed 2](https://www.splunk.com/en_us/blog/security/citrixbleed-vulnerability-detection-mitigation.html), [CosmicSting](https://www.splunk.com/en_us/blog/security/cosmicsting-a-critical-xxe-vulnerability-in-adobe-commerce-and-magento.html), [CUPS](https://www.splunk.com/en_us/blog/security/my-cups-runneth-over-with-cves.html), [Cisco FTD detections](https://www.splunk.com/en_us/blog/security/securing-network-edge-cisco-ftd-splunk-detections.html), [ShellSweepPlus](https://www.splunk.com/en_us/blog/security/shellsweepplus-web-shell-detection-tool.html), [CrushFTP](https://www.splunk.com/en_us/blog/security/security-insights-detecting-cve-2024-4040-exploitation-in-crushftp.html), [TeamCity](https://www.splunk.com/en_us/blog/security/security-insights-jetbrains-teamcity-cve-2024-27198-and-cve-2024-27199.html) | [Static Tundra / Smart Install](http://splunk.com/en_us/blog/security/cve-2018-0171-static-tundra-smart-install-detection-guide.html), [Copy Fail](https://www.splunk.com/en_us/blog/security/detecting-copy-fail-cve-2026-31431-phenomenal-power-itty-bitty-script.html) | H6 |
| Windows tradecraft | [Netsh tricks](https://www.splunk.com/en_us/blog/security/netsh-firewall-evasion-techniques.html), [SQL Server abuse](https://www.splunk.com/en_us/blog/security/guide-detect-sinister-sql-attacks.html), [PowerShell Web Access](https://www.splunk.com/en_us/blog/security/powershell-web-access-your-network-s-backdoor-in-plain-sight.html), [Defender ASR](https://www.splunk.com/en_us/blog/security/deploy-test-monitor-mastering-microsoft-defender-asr-with-atomic-techniques-in-splunk.html) | [NotDoor Outlook macros](https://www.splunk.com/en_us/blog/security/notdoor-insights-a-closer-look-at-outlook-macros-and-more.html) | H3, H4, H5 |
| Identity and cloud | [Okta sign-on policy bypass](https://www.splunk.com/en_us/blog/security/bypassing-the-bypass-detecting-okta-classic-application-sign-on-policy-evasion.html), [M365: Midnight Blizzard](https://www.splunk.com/en_us/blog/security/hunting-m365-invaders-navigating-the-shadows-of-midnight-blizzard.html), [M365: email collection](https://www.splunk.com/en_us/blog/security/hunting-m365-invaders-dissecting-email-collection-techniques.html), [Cisco NVM](https://www.splunk.com/en_us/blog/security/cisco-network-visibility-module-nvm-splunk-endpoint-security-insights.html) | [M365 Copilot logs](https://www.splunk.com/en_us/blog/artificial-intelligence/m365-copilot-log-analysis-splunk.html), [Kubernetes with Tetragon](https://www.splunk.com/en_us/blog/security/kubernetes-attack-simulations-ebpf-tetragon-splunk.html), [AWS Bedrock monitoring](https://www.splunk.com/en_us/blog/artificial-intelligence/using-splunk-to-monitor-aws-bedrock-claude-security.html) | H8, H9, H10 |
| AI as target or tool | [RAG for detections](https://www.splunk.com/en_us/blog/artificial-intelligence/splunk-ai-rag-cybersecurity-detections.html) | [LAMEHUG](https://www.splunk.com/en_us/blog/security/lamehug-ai-driven-malware-llm-cyber-intrusion-analysis.html), [Ollama add-on](https://www.splunk.com/en_us/blog/artificial-intelligence/splunk-technology-add-on-for-ollama.html), [multi-agent observability](https://www.splunk.com/en_us/blog/artificial-intelligence/observability-challenges-in-multi-agentic-environments.html) | H3 |
| Tooling | [Attack Range v4](https://www.splunk.com/en_us/blog/security/splunk-attack-range-v4-threat-detection-emulation.html), [ESCU 5.0](https://www.splunk.com/en_us/blog/security/enterprise-security-content-update-v5-0-0.html) | [Attack Range v5](https://www.splunk.com/en_us/blog/security/splunk-attack-range-v5-security-lab-guide.html), [TOTAL-REPLAY](https://www.splunk.com/en_us/blog/security/total-replay-splunk-attack-data-testing.html) | Practice lab |

How the two line up:

- **Strongest overlap is the Windows endpoint chain.** Most pre-v10 research is lure, loader, stealer or RAT, then persistence and defence evasion. Expect Sysmon and PowerShell logging to carry at least one scenario.
- **Identity research matches the cloud terrain.** Okta, Entra ID and Microsoft 365 posts all predate v10, and the higher-ed recap confirms cloud-to-on-prem pivoting.
- **Web exploitation is the wildcard.** SharePoint with IIS-module persistence was published in July 2025, late for a September game, but web shell and IIS hunting is cheap to prepare.
- **AI research does map to v10, through scenario 5.** The STRT Ollama posts were published after the debut, but they cover the same ground as the LLM scenario, so read the Ollama add-on post and the Suspicious Ollama Activities story before the day (H16).
- **Analytic stories are searchable by name.** Each post maps to a story on [research.splunk.com](https://research.splunk.com/stories/muddywater) with ready-made SPL; if a question names a malware family, look there first.

The quarterly round-ups list every analytic story if you need the full catalogue: [August 2026](https://www.splunk.com/en_us/blog/security/splunk-security-content-for-threat-detection-response-august-2026-update.html), [May 2026](https://www.splunk.com/en_us/blog/security/splunk-security-content-for-threat-detection-response-may-2026-update.html), [February 2026](https://www.splunk.com/en_us/blog/security/splunk-security-content-for-threat-detection-response-february-update.html), [November 2025](https://www.splunk.com/en_us/blog/security/latest-splunk-security-content.html), [earlier quarters](https://www.splunk.com/en_us/blog/security/security-content-q4-roundup.html).

## Hunting SPL by case

These searches are written against standard add-on field names, not against the v10 dataset, so run H0 first and adjust. Replace `index=*` with the indexes each scenario names (main, bots10, frothxly), and set the time picker to All time: BOTS data is historical and the default window returns nothing.

### H0. Orientation (first five minutes)

```
| tstats count min(_time) as first max(_time) as last where index=* by index sourcetype
| convert ctime(first) ctime(last)
| sort - count
```

```
| tstats count where index=* by host sourcetype
| stats sum(count) as events values(sourcetype) as sourcetypes by host
```

```
index=* sourcetype=<sourcetype>
| head 5000
| fieldsummary maxvals=5
| table field count distinct_count values
```

Pivot on any indicator (IP, user, hash, file name) to see where it lives and when:

```
index=* "<indicator>"
| stats count min(_time) as first max(_time) as last by index sourcetype host
| convert ctime(first) ctime(last)
```

### H1. Phishing and lures

```
index=* sourcetype=stream:smtp attach_filename{}=*
| table _time sender receiver{} subject attach_filename{} attach_content_md5_hash{} src_ip
```

```
index=* sourcetype=o365:management:activity Workload=Exchange Operation IN (Send, SendAs, MailItemsAccessed)
| stats count by UserId ClientIP Operation
```

Then submit the URL, attachment or hash to Attack Analyzer and read the verdict, the redirect chain and the extracted indicators (see H13).

### H2. Fake CAPTCHA / ClickFix (paste-and-run)

```
index=* source="*Sysmon*" EventCode=13 TargetObject="*\\Explorer\\RunMRU\\*"
| table _time host User Details
```

```
index=* source="*Sysmon*" EventCode=1 ParentImage="*\\explorer.exe"
  Image IN ("*\\powershell.exe", "*\\pwsh.exe", "*\\mshta.exe", "*\\cmd.exe", "*\\curl.exe", "*\\msiexec.exe")
| table _time host User Image CommandLine
```

### H3. Execution: odd parents, encoded PowerShell, process trees

```
index=* source="*Sysmon*" EventCode=1
| stats count min(_time) as first values(CommandLine) as cmd by host ParentImage Image
| sort count
```

```
index=* source="*Sysmon*" EventCode=1
  ParentImage IN ("*\\winword.exe", "*\\excel.exe", "*\\outlook.exe", "*\\wscript.exe", "*\\mshta.exe", "*\\w3wp.exe", "*\\sqlservr.exe")
| table _time host User ParentImage Image CommandLine
```

```
index=* (EventCode=1 OR EventCode=4688)
  (CommandLine="* -enc*" OR CommandLine="* -e *" OR CommandLine="*FromBase64String*" OR CommandLine="*DownloadString*" OR CommandLine="*IEX*")
| table _time host User ParentImage CommandLine
```

```
index=* EventCode=4104 ScriptBlockText IN ("*FromBase64String*", "*Net.WebClient*", "*Invoke-Expression*", "*AmsiUtils*", "*Invoke-WebRequest*")
| sort 0 _time
| table _time host Path ScriptBlockId ScriptBlockText
```

Walk a process tree from one GUID, and pull the hash for OSINT:

```
index=* source="*Sysmon*" EventCode=1 host=<host> (ProcessGuid="<guid>" OR ParentProcessGuid="<guid>")
| rex field=Hashes "SHA256=(?<sha256>[A-Fa-f0-9]{64})"
| sort 0 _time
| table _time ProcessId ParentProcessId Image CommandLine sha256
```

### H4. Persistence

```
index=* source="*Sysmon*" EventCode IN (12, 13)
  TargetObject IN ("*\\CurrentVersion\\Run*", "*\\Services\\*\\ImagePath", "*\\Winlogon\\*", "*\\Image File Execution Options\\*")
| table _time host Image TargetObject Details
```

```
index=* (EventCode IN (4698, 4697, 7045) OR (EventCode=1 Image="*\\schtasks.exe" CommandLine="*/create*"))
| table _time host EventCode TaskName ServiceName ImagePath CommandLine
```

```
index=* EventCode IN (4720, 4722, 4728, 4732, 4756)
| table _time host EventCode SubjectUserName TargetUserName MemberSid
```

```
index=* source="*Sysmon*" EventCode=11
  TargetFilename IN ("*\\Start Menu\\Programs\\Startup\\*", "*\\Outlook\\VbaProject.OTM", "*\\inetsrv\\*.dll")
| table _time host Image TargetFilename
```

For IIS-module persistence also search `CommandLine="*appcmd*" CommandLine="*module*"`.

### H5. Credential access and lateral movement

```
index=* EventCode=4625
| stats count dc(TargetUserName) as users values(TargetUserName) as sample by IpAddress
| sort - count
```

```
index=* EventCode IN (4624, 4625) IpAddress=<attacker_ip>
| sort 0 _time
| table _time EventCode TargetUserName LogonType WorkstationName host
```

```
index=* EventCode=4624 LogonType IN (3, 10) NOT TargetUserName="*$"
| stats count min(_time) as first by IpAddress TargetUserName host LogonType
| convert ctime(first)
| sort first
```

```
index=* source="*Sysmon*" EventCode=10 TargetImage="*\\lsass.exe"
| stats count by host SourceImage GrantedAccess
```

```
index=* EventCode=4769 TicketEncryptionType=0x17 NOT ServiceName="*$"
| stats count dc(ServiceName) as services by IpAddress TargetUserName
```

```
index=* (EventCode=7045 (ServiceName=PSEXESVC OR ImagePath="*ADMIN$*" OR ImagePath="*COMSPEC*"))
  OR (EventCode=1 ParentImage="*\\WmiPrvSE.exe")
  OR (EventCode IN (1102, 104))
| table _time host EventCode ServiceName ImagePath Image CommandLine
```

### H6. Web exploitation and web shells

```
index=* sourcetype=stream:http
| stats count dc(uri_path) as uris values(http_user_agent) as ua by src_ip dest_ip
| sort - count
```

```
index=* sourcetype=stream:http http_method=POST form_data=*
| stats count values(status) as status by src_ip uri_path
| sort - count
```

```
index=* sourcetype IN (iis, ms:iis:auto, ms:iis:default)
  cs_uri_stem IN ("*.aspx", "*.ashx", "*.php", "*.jsp")
| stats count dc(c_ip) as clients values(cs_method) as methods values(sc_status) as status min(_time) as first by cs_uri_stem
| where clients<=2
| convert ctime(first)
```

SharePoint ToolShell pattern from the STRT post, then whatever the web server spawned or wrote:

```
index=* sourcetype IN (iis, ms:iis:auto, ms:iis:default) cs_method=POST cs_uri_stem="*/_layouts/15/ToolPane.aspx"
| table _time c_ip cs_uri_stem cs_uri_query cs_Referer sc_status cs_User_Agent
```

```
index=* source="*Sysmon*"
  ((EventCode=1 ParentImage IN ("*\\w3wp.exe", "*\\httpd.exe", "*\\nginx.exe", "*\\php-cgi.exe", "*\\sqlservr.exe"))
  OR (EventCode=11 Image="*\\w3wp.exe" TargetFilename IN ("*.aspx", "*.ashx", "*.dll")))
| table _time host EventCode Image CommandLine TargetFilename User
```

### H7. Command and control, DNS, exfiltration

Beaconing: many connections with a near-constant gap.

```
index=* sourcetype=stream:http
| sort 0 src_ip dest_ip _time
| streamstats current=f last(_time) as prev by src_ip dest_ip
| eval gap=_time-prev
| stats count avg(gap) as avg_gap stdev(gap) as sd values(site) as site by src_ip dest_ip
| where count>20 AND sd<5
```

```
index=* sourcetype=stream:dns query=*
| eval q=mvindex(query,0), qlen=len(q)
| rex field=q "(?<domain>[^.]+\.[^.]+)$"
| stats count dc(q) as subdomains max(qlen) as longest by src_ip domain
| sort - subdomains
```

```
index=* source="*Sysmon*" EventCode IN (3, 22)
| stats count values(QueryName) as dns values(DestinationIp) as ip values(DestinationPort) as port by host Image
| sort count
```

```
index=* sourcetype IN (pan:traffic, stream:tcp, cisco:asa)
| stats sum(bytes_out) as out by src_ip dest_ip dest_port
| eval MB=round(out/1024/1024,2)
| sort - out
```

```
index=* sourcetype=suricata event_type=alert
| stats count min(_time) as first by alert.signature alert.signature_id src_ip dest_ip
| convert ctime(first)
| sort - count
```

Rare user agents are a cheap win: `| stats count dc(src_ip) as clients by http_user_agent | sort count`.

### H8. AWS (CloudTrail)

```
index=* sourcetype=aws:cloudtrail
| stats count dc(eventName) as apis values(sourceIPAddress) as ips values(userAgent) as ua by userIdentity.arn
| sort - count
```

```
index=* sourcetype=aws:cloudtrail errorCode=*
| stats count values(eventName) as calls by userIdentity.arn sourceIPAddress errorCode
| sort - count
```

```
index=* sourcetype=aws:cloudtrail eventName=ConsoleLogin
| table _time userIdentity.arn sourceIPAddress responseElements.ConsoleLogin additionalEventData.MFAUsed userAgent
```

```
index=* sourcetype=aws:cloudtrail eventName IN (CreateUser, CreateAccessKey, CreateLoginProfile, AttachUserPolicy, PutUserPolicy, AttachRolePolicy, UpdateAssumeRolePolicy)
| table _time eventID eventName userIdentity.arn sourceIPAddress requestParameters.userName requestParameters.policyArn
```

```
index=* sourcetype=aws:cloudtrail eventName IN (PutBucketAcl, PutBucketPolicy, DeleteBucketPublicAccessBlock, PutBucketPublicAccessBlock)
| table _time eventID eventName userIdentity.arn requestParameters.bucketName requestParameters.AccessControlPolicy.AccessControlList.Grant{}.Grantee.URI
```

```
index=* sourcetype=aws:cloudtrail eventName IN (StopLogging, DeleteTrail, UpdateTrail, PutEventSelectors, DeleteFlowLogs, GetSecretValue, GetCallerIdentity, RunInstances)
| table _time eventName userIdentity.arn userIdentity.accessKeyId sourceIPAddress awsRegion requestParameters.instanceType
```

Once you have a stolen key, pivot on it: `userIdentity.accessKeyId=<AKIA...>` sorted by time gives the whole attacker session.

### H9. Entra ID and Microsoft 365

```
index=* sourcetype=azure:monitor:aad category=SignInLogs
| stats count values(properties.status.errorCode) as errors values(properties.appDisplayName) as apps by properties.userPrincipalName properties.ipAddress properties.location.countryOrRegion
| sort - count
```

Password spray (error 50126 is a bad password; 0 is success):

```
index=* sourcetype=azure:monitor:aad category=SignInLogs properties.status.errorCode=50126
| stats count dc(properties.userPrincipalName) as users by properties.ipAddress properties.userAgent
| sort - users
```

```
index=* sourcetype=azure:monitor:aad category=AuditLogs
| stats count by operationName properties.initiatedBy.user.userPrincipalName
| sort count
```

```
index=* sourcetype=o365:management:activity Operation IN (New-InboxRule, Set-InboxRule, UpdateInboxRules, Set-Mailbox, Add-MailboxPermission)
| table _time UserId ClientIP Operation Parameters{}.Name Parameters{}.Value
```

```
index=* sourcetype=o365:management:activity Operation IN (MailItemsAccessed, FileDownloaded, FileSyncDownloadedFull, AnonymousLinkCreated)
| stats count dc(ObjectId) as objects by UserId ClientIP Operation ClientInfoString
| sort - count
```

In the audit log, read the rare operations first: new service principal credentials, application consent and role additions are the usual persistence steps.

### H10. Okta

```
index=* sourcetype=OktaIM2:log
| stats count by eventType outcome.result
| sort - count
```

```
index=* sourcetype=OktaIM2:log eventType IN (user.session.start, user.authentication.auth_via_mfa, user.mfa.factor.deactivate, user.mfa.factor.reset_all, user.account.reset_password, system.api_token.create, user.session.impersonation.initiate, policy.evaluate_sign_on)
| table _time eventType actor.alternateId client.ipAddress client.userAgent.rawUserAgent outcome.result outcome.reason
```

```
index=* sourcetype=OktaIM2:log eventType=system.push.send_factor_verify_push
| bin _time span=10m
| stats count by _time actor.alternateId client.ipAddress
| where count>5
```

### H11. Ransomware and wipers

```
index=* source="*Sysmon*" EventCode=1
  CommandLine IN ("*vssadmin*delete*shadows*", "*shadowcopy*delete*", "*bcdedit*recoveryenabled*", "*wbadmin*delete*catalog*", "*wevtutil*cl *", "*fsutil*usn*deletejournal*", "*manage-bde*", "*netsh*advfirewall*", "*DisableRealtimeMonitoring*")
| table _time host User ParentImage CommandLine
```

```
index=* source="*Sysmon*" EventCode=11
| rex field=TargetFilename "\.(?<ext>\w{2,10})$"
| bin _time span=1m
| stats dc(TargetFilename) as files by _time host Image ext
| where files>100
```

Ransom note: the same file name written into many folders.

```
index=* source="*Sysmon*" EventCode=11
| eval fname=mvindex(split(TargetFilename,"\\"),-1)
| stats dc(TargetFilename) as copies min(_time) as first by host fname
| where copies>20
| convert ctime(first)
```

### H12. Enterprise Security

```
`notable`
| stats count by rule_name urgency
| sort - count
```

```
index=risk
| stats sum(risk_score) as score dc(source) as detections values(source) as rules values(annotations.mitre_attack.mitre_technique_id) as ttp by risk_object risk_object_type
| sort - score
```

```
| inputlookup identity_lookup_expanded
| search identity="*<name>*"
```

```
| inputlookup asset_lookup_by_str
| search nt_host="<host>" OR ip="<ip>"
```

```
| tstats summariesonly=false count from datamodel=Endpoint.Processes
  where Processes.process_name IN (powershell.exe, cmd.exe, rundll32.exe, mshta.exe)
  by Processes.dest Processes.user Processes.parent_process_name Processes.process
```

Questions about people and machines (phone number, owner, MAC address, business unit) are answered from the asset and identity lookups, not from events.

### H13. SOAR and Attack Analyzer (mostly in their own consoles)

- **SOAR.** Open the container named in the question, then read in this order: artifacts (CEF fields), playbook run history, action results (the raw JSON holds the answer more often than the summary), notes and approvals. Playbook questions are answered in the visual editor: block names, decision conditions, the app and action each block calls.
- **Attack Analyzer.** Open the job, then read: verdict and score, detections, the resource tree (redirect chain, dropped files and their hashes), screenshots, and the impersonated brand for phishing kits.
- **If their data is also indexed**, find it with `| tstats count where index=* (sourcetype=splunk:aa* OR index=phantom*) by index sourcetype`. Those names are my best recollection of the add-ons; H0 will show the real ones.

### H14. SPL one-liners for answer formatting

- First or last event: `| sort 0 _time | head 1` or `| stats earliest(_time) as first latest(_time) as last`.
- Timestamp in the asked format: `| eval t=strftime(_time,"%Y-%m-%d %H:%M:%S")`. Check whether the question wants UTC.
- Sizes: `| eval MB=round(bytes/1024/1024,2)`. Questions usually say whether to use 1024.
- Decode a URL: `| eval u=urldecode(uri_query)`.
- Extract on the fly: `| rex field=_raw "user=(?<u>[^&\s]+)"`.
- Longest value: `| eval l=len(field) | sort - l | head 1`.
- Hash a string: `| eval h=md5(field)` or `sha256(field)`.
- Subnet test and geo: `| where cidrmatch("10.0.0.0/8", src_ip)` and `| iplocation src_ip`.
- Nested JSON: `| spath path=requestParameters.ipPermissions.items{}.ipRanges.items{}.cidrIp`.
- Multivalue: `mvcount(f)`, `mvindex(f,0)`, `| mvexpand f`.
- Base64: SPL has no dependable built-in decoder, so paste into CyberChef. PowerShell `-enc` payloads are UTF-16LE.

### H15. Splunk as the crime scene (scenario 3, Hops of Deception)

An MSP contractor working in Splunk leaves every search in the audit index. If players cannot read `_audit` or `_internal`, look for a copy of that data in main.

```
index=_audit action=search info=granted search=* NOT user=splunk-system-user
| stats count dc(search) as searches min(_time) as first max(_time) as last by user
| convert ctime(first) ctime(last)
```

```
index=_audit action=search info=granted user=<contractor> search=*
| sort 0 _time
| table _time user search_id search
```

```
index=_audit action=search info=granted
  (search="*| rest*" OR search="*inputlookup*" OR search="*outputlookup*" OR search="*sendemail*" OR search="*| delete*" OR search="*identity*" OR search="*password*")
| table _time user search
```

```
index=_audit NOT action=search
| stats count by action info user
| sort count
```

```
index=_internal sourcetype IN (splunkd_ui_access, splunkd_access, splunk_web_access) user=<contractor>
| stats count by method uri_path status clientip
| sort - count
```

Then the probing outside Splunk: several discovery tools from one account in a short window, and one source touching many hosts or ports.

```
index=* (EventCode=1 OR EventCode=4688)
  Image IN ("*\\whoami.exe", "*\\net.exe", "*\\net1.exe", "*\\nltest.exe", "*\\ipconfig.exe", "*\\systeminfo.exe", "*\\tasklist.exe", "*\\quser.exe", "*\\nslookup.exe", "*\\arp.exe")
| bin _time span=10m
| stats dc(Image) as tools values(CommandLine) as cmds by _time host User
| where tools>=3
```

```
index=* dest_port=* src_ip=*
| stats dc(dest_ip) as hosts dc(dest_port) as ports by src_ip
| where hosts>20 OR ports>50
| sort - ports
```

For the escalation stage, go to H5 (lateral movement) and H11 (ransomware and wipers).

### H16. Self-hosted LLM (scenario 5, Threat Intel O'LLMa)

Find the LLM and pipeline data first; I do not know the sourcetype names, so search wide.

```
| tstats count where index IN (main, bots10) (sourcetype=*ollama* OR sourcetype=*llm* OR sourcetype=*git* OR sourcetype=*jenkins* OR sourcetype=*docker* OR sourcetype=*kube*) by index sourcetype
```

```
index IN (main, bots10) (ollama OR "11434" OR "/api/generate" OR "/api/chat" OR "/api/pull" OR "/api/push" OR "/api/create" OR "/api/tags" OR Modelfile OR gguf)
| stats count min(_time) as first by index sourcetype host
| convert ctime(first)
```

Who reached the model API (Ollama listens on port 11434 by default), and was it exposed beyond localhost:

```
index IN (main, bots10) (dest_port=11434 OR DestinationPort=11434)
| eval src=coalesce(src_ip, SourceIp), dst=coalesce(dest_ip, DestinationIp)
| stats count min(_time) as first by src dst
| convert ctime(first)
```

```
index IN (main, bots10) ("OLLAMA_HOST" OR "0.0.0.0:11434" OR "ollama serve" OR "ollama pull" OR "ollama push" OR "ollama create" OR "ollama run")
| sort 0 _time
| table _time host sourcetype _raw
```

Prompts, model names and injection attempts, once you know the sourcetype:

```
index IN (main, bots10) sourcetype=<llm_sourcetype>
| stats count by model
```

```
index IN (main, bots10) sourcetype=<llm_sourcetype>
  ("ignore previous" OR "ignore all" OR "system prompt" OR "you are now" OR jailbreak OR "developer mode" OR base64)
| sort 0 _time
| table _time host _raw
```

Pipeline side: who changed the workflow, what the job ran, where the model came from.

```
index IN (main, bots10) ("workflow" OR "pipeline" OR "runner" OR "huggingface" OR ".safetensors" OR ".pkl" OR "pickle")
| stats count by sourcetype host
```

Know the OWASP Top 10 for LLM Applications (2025) by number, since questions may ask which risk an event illustrates: LLM01 Prompt Injection, LLM02 Sensitive Information Disclosure, LLM03 Supply Chain, LLM04 Data and Model Poisoning, LLM05 Improper Output Handling, LLM06 Excessive Agency, LLM07 System Prompt Leakage, LLM08 Vector and Embedding Weaknesses, LLM09 Misinformation, LLM10 Unbounded Consumption. Keep MITRE ATLAS open in a tab as well.

### H17. Insider data theft (scenario 6, Rogue Intentions; also scenario 2)

Work in three steps: who touched the recipe files, how they staged them, how they left.

```
index IN (main, bots10) (recipe OR flavor OR flavour OR formula OR blueprint)
| stats count min(_time) as first by index sourcetype host
| convert ctime(first)
```

```
index IN (main, bots10) EventCode IN (4663, 5145) (ObjectName="*<file>*" OR RelativeTargetName="*<file>*")
| table _time host SubjectUserName IpAddress ShareName RelativeTargetName ObjectName AccessMask
```

```
index IN (main, bots10) (EventCode=1 OR EventCode=4688)
  CommandLine IN ("*7z*", "*rar *", "*Compress-Archive*", "*tar *", "*.zip*", "*robocopy*", "*xcopy*", "*rclone*")
| table _time host User CommandLine
```

```
index IN (main, bots10) (EventCode=6416 OR TargetObject="*\\Enum\\USBSTOR\\*" OR "USBSTOR")
| table _time host EventCode DeviceDescription TargetObject
```

```
index IN (main, bots10) (dropbox OR "drive.google" OR "mega.nz" OR wetransfer OR pastebin OR "transfer.sh" OR "file.io" OR "anonfiles" OR protonmail OR gmail)
| stats count sum(bytes_out) as out by sourcetype src_ip user
| sort - out
```

```
index IN (main, bots10) sourcetype=stream:smtp attach_filename{}=* NOT receiver{}="*<corporate_domain>"
| table _time sender receiver{} subject attach_filename{}
```

Activity outside working hours is a quick discriminator: `| eval hour=strftime(_time,"%H") | stats count by user hour`.

### H18. Custom logs and a breached web game (scenario 1, Cats and Dawgs)

The brief promises custom logs, so expect to build your own fields. Learn the shape of each sourcetype before hunting.

```
index=* sourcetype=<custom>
| stats count by punct
| sort - count
```

```
index=* sourcetype=<custom>
| cluster showcount=t
| sort cluster_count
| table cluster_count _raw
```

Extraction tools, in order of effort: `| spath` for JSON, `| extract pairdelim=" " kvdelim="="` for key=value, `| rex field=_raw "..."` for everything else.

```
index=* sourcetype=<custom>
| rex field=_raw "(?<client>\d{1,3}(?:\.\d{1,3}){3})"
| rex field=_raw "\"(?<method>GET|POST|PUT|DELETE|PATCH) (?<path>\S+)"
| rex field=_raw "\s(?<code>[1-5]\d\d)\s"
| stats count by client method path code
| sort - count
```

Attack strings and tampering, then the error spike that marks the breach:

```
index=* ("UNION SELECT" OR "' OR " OR "%27" OR "../" OR "<script" OR "sleep(" OR "/etc/passwd" OR "cmd=" OR "eval(" OR "${jndi")
| stats count min(_time) as first by sourcetype host
| convert ctime(first)
```

```
index=* sourcetype=<custom> (error OR exception OR denied OR unauthorized OR 500)
| timechart span=5m count by host
```

Follow one request or session across the services by its identifier: `index=* "<request_or_session_id>" | sort 0 _time | table _time sourcetype host _raw`.

### H19. Lure, developer tooling and remote access (scenario 4, Zero Chill)

Start from Mallory's host and account in the two named indexes, then pivot into Attack Analyzer with whatever file or URL she received (H13).

```
index IN (main, frothxly) (mallory OR mkraeusen OR finn OR wiggen)
| stats count min(_time) as first max(_time) as last by index sourcetype host
| convert ctime(first) ctime(last)
```

```
index IN (main, frothxly) source="*Sysmon*" EventCode IN (11, 15) host=<mallory_host>
  TargetFilename IN ("*\\Downloads\\*", "*\\Temp\\*", "*.lnk", "*.iso", "*.msi", "*.msix", "*.js", "*.hta", "*.zip")
| table _time Image TargetFilename Hash Contents
```

She is "learning new technical skills", so check what developer tools spawned:

```
index IN (main, frothxly) source="*Sysmon*" EventCode=1
  ParentImage IN ("*\\node.exe", "*\\Code.exe", "*\\python.exe", "*\\git.exe", "*\\npm.cmd", "*\\bash.exe")
| table _time host User ParentImage Image CommandLine
```

Remote-access and tunnelling tools, which is where a too-quiet remote developer would show:

```
index IN (main, frothxly) (anydesk OR teamviewer OR rustdesk OR screenconnect OR splashtop OR "chrome remote" OR ngrok OR tailscale OR "cloudflared" OR "astrill")
| stats count min(_time) as first by sourcetype host
| convert ctime(first)
```

```
index IN (main, frothxly) (finn OR wiggen) (src_ip=* OR ClientIP=* OR IpAddress=*)
| eval ip=coalesce(src_ip, ClientIP, IpAddress)
| iplocation ip
| stats count min(_time) as first by ip Country City
```

## Field list by sourcetype

Fields are ordered by how often they carry a BOTS answer, and rows by how likely the source is to matter. The v10 sourcetype list is not public, so these are the sources seen in public BOTS v1 to v3 data and in the v9 Tokyo report, with the field names their standard add-ons produce; confirm with `fieldsummary` (H0).

| Sourcetype | Fields, most useful first | Answers questions about |
| --- | --- | --- |
| Sysmon (`XmlWinEventLog`, source contains `Sysmon`) | `EventCode`, `CommandLine`, `Image`, `ParentImage`, `ParentCommandLine`, `User`, `Computer`, `ProcessGuid`, `ParentProcessGuid`, `Hashes`, `TargetFilename`, `TargetObject`, `Details`, `DestinationIp`, `DestinationPort`, `QueryName`, `SourceImage`, `TargetImage`, `GrantedAccess`, `PipeName` | What ran, who ran it, what it wrote, where it connected |
| Windows Security (`WinEventLog` or `XmlWinEventLog`) | `EventCode`, `TargetUserName`, `SubjectUserName`, `LogonType`, `IpAddress`, `WorkstationName`, `NewProcessName`, `CommandLine`, `ServiceName`, `TaskName`, `TicketEncryptionType`, `Status` (classic rendering: `Account_Name`, `Logon_Type`, `Source_Network_Address`) | Logons, brute force, lateral movement, new accounts, services, tasks |
| PowerShell (`XmlWinEventLog`, PowerShell/Operational) | `EventCode` (4104), `ScriptBlockText`, `Path`, `ScriptBlockId`, `MessageNumber`, `MessageTotal`, `UserID` | Decoded scripts, download URLs, in-memory payloads |
| `aws:cloudtrail` | `eventName`, `userIdentity.arn`, `sourceIPAddress`, `errorCode`, `userIdentity.accessKeyId`, `requestParameters.*`, `responseElements.*`, `userAgent`, `eventSource`, `awsRegion`, `eventID`, `additionalEventData.MFAUsed`, `userIdentity.type` | Who called which API, from where, with which key; public buckets; new keys |
| `azure:monitor:aad` | `properties.userPrincipalName`, `properties.ipAddress`, `properties.status.errorCode`, `properties.appDisplayName`, `properties.location.countryOrRegion`, `properties.userAgent`, `properties.conditionalAccessStatus`, `operationName`, `properties.initiatedBy.user.userPrincipalName`, `properties.targetResources{}.displayName`, `category` | Sign-ins, sprays, MFA, consent grants, role and credential changes |
| `o365:management:activity` | `Operation`, `UserId`, `ClientIP`, `Workload`, `ObjectId`, `Parameters{}.Name`, `Parameters{}.Value`, `ResultStatus`, `ClientInfoString`, `UserAgent`, `AppId`, `MailboxOwnerUPN` | Inbox rules, mailbox access, file downloads, sharing links |
| `stream:http` | `src_ip`, `dest_ip`, `site`, `uri_path`, `http_method`, `status`, `http_user_agent`, `form_data`, `uri_query`, `src_headers`, `dest_content`, `http_referrer`, `http_content_type`, `cookie`, `bytes_out` | Scans, brute force, uploads, web shells, downloaded files |
| IIS (`iis`, `ms:iis:auto`) | `c_ip`, `cs_uri_stem`, `cs_method`, `sc_status`, `cs_uri_query`, `cs_User_Agent`, `cs_Referer`, `cs_username`, `s_ip`, `time_taken`, `sc_bytes`, `cs_bytes` | Exploited pages, web shell access, attacker IP and tooling |
| `stream:dns` | `query`, `src_ip`, `query_type`, `host_addr`, `reply_code`, `name`, `dest_ip` | Domains resolved, tunnelling, dynamic DNS, first resolution time |
| `suricata` | `alert.signature`, `alert.signature_id`, `src_ip`, `dest_ip`, `alert.category`, `event_type`, `http.hostname`, `http.url`, `tls.sni`, `fileinfo.filename`, `alert.severity` | Named malware or CVE, signature IDs, file names on the wire |
| `stream:smtp` | `sender`, `receiver{}`, `subject`, `attach_filename{}`, `attach_content_md5_hash{}`, `src_ip`, `content{}` | Phishing sender, attachment name and hash |
| `OktaIM2:log` | `eventType`, `actor.alternateId`, `client.ipAddress`, `outcome.result`, `outcome.reason`, `client.userAgent.rawUserAgent`, `target{}.alternateId`, `displayMessage`, `client.geographicalContext.country`, `authenticationContext.externalSessionId` | Sessions, MFA changes, policy evaluation, admin actions |
| Firewall (`pan:traffic`, `pan:threat`, `cisco:asa`) | `src_ip`, `dest_ip`, `dest_port`, `action`, `app`, `bytes_out`, `bytes_in`, `user`, `rule`, `url`, `threat_name`, `file_name` | Allowed or blocked flows, data volume, application |
| AWS data (`aws:cloudwatchlogs:vpcflow`, `aws:s3:accesslogs`) | VPC flow: `src_ip`, `dest_ip`, `dest_port`, `action`, `bytes`, `interface_id`. S3: `operation`, `key`, `bucket_name`, `remote_ip`, `http_status`, `user_agent` | Traffic to an instance; which objects were uploaded or downloaded |
| Linux (`linux_secure`, `linux:audit`, `osquery:results`) | `user`, `src_ip`, `action`, `process`; audit: `type`, `exe`, `comm`, `proctitle`, `auid`, `key`; osquery: `name`, `columns.*`, `hostIdentifier` | SSH logons, sudo, executed commands, new users and cron jobs |
| ES `notable` and `risk` indexes | Notable: `rule_name`, `urgency`, `src`, `dest`, `user`, `security_domain`. Risk: `risk_object`, `risk_score`, `source`, `risk_message`, `threat_object`, `annotations.mitre_attack.mitre_technique_id` | Which detections fired, on whom, mapped to which technique |

Three rules of thumb on fields:

- **`host` is not always the victim.** For network and cloud sources it is the collector; use `Computer`, `dest` or `dvc`.
- **Multivalue JSON fields end in `{}`**; quote them in searches (`"attach_filename{}"`) when a command complains.
- **When a field is missing, search the raw text.** A bare keyword search is slower but never misses on extraction gaps.

Sources the real scenarios add:

| Sourcetype | Fields, most useful first | Answers questions about |
| --- | --- | --- |
| `audittrail` (index `_audit`), scenario 3 | `user`, `action`, `info`, `search`, `search_id`, `total_run_time`, `event_count`, `result_count`, `object`, `src` | What the contractor searched, changed and exported in Splunk |
| `splunkd_ui_access`, `splunkd_access` (index `_internal`), scenario 3 | `user`, `uri_path`, `method`, `status`, `clientip`, `useragent` | Which Splunk pages and REST endpoints were touched, from where |
| LLM and API logs (names unknown), scenario 5 | Look for `model`, `prompt`, `response`, `endpoint` or `uri_path`, `src_ip`, `status`, `duration`, token counts, `user` | Which model, who called it, what was asked, what leaked |
| CI/CD logs (names unknown), scenario 5 | Look for `actor` or `user`, `repository`, `workflow` or `job`, `action`, `commit`, `branch`, `runner` | Who changed the pipeline and what it pulled or published |
| Custom game and service logs, scenario 1 | None extracted by default; build `client`, `method`, `path`, `code`, session or request ID with H18 | The request that broke in, and its path across services |

## Preparing for and playing BOTS

Speed and accuracy both score, so preparation is mostly about removing hesitation: know where each kind of answer lives, and split the scenarios before the clock starts. The scoring details below come from the Tokyo v9 report; confirm them in the organisers' briefing.

### Before the day

- [x] Register on [bots.splunk.com](https://bots.splunk.com/) as well as on the event page. Regional events do not allow game-day registration.
- [x] Play an older version on the portal, or load the open BOTS v1 to v3 datasets. Past players report that question styles recur.
- [ ] Work through the [Hunting with Splunk series](https://www.splunk.com/blog/2017/07/06/hunting-with-splunk-the-basics.html), at least the posts on `tstats`, `stats`, `rex`, Sysmon, CloudTrail, Office 365 and Azure.
- [ ] Get hands on the three consoles you may not use daily: ES (notables, risk, asset and identity centres), SOAR (containers, artifacts, playbook editor) and Attack Analyzer (job view).
- [ ] Prepare an OSINT kit in browser tabs: VirusTotal, urlscan, WHOIS and passive DNS, CyberChef, MITRE ATT&CK, AWS and Microsoft event references.
- [x] Print or pin this sheet, and agree on one shared notes file for indicators.

### Team roles (for a team of 4)

| Player | Scenarios | Hunts | Why together |
| --- | --- | --- | --- |
| Endpoint | 2 Hot Dog Heist, then the escalation half of 3 | H1, H3, H4, H5, H7, H11 | Both are classic intrusion chains on Windows data |
| Insider and Splunk | 3 Hops of Deception, 6 Rogue Intentions | H15, H17, H9 | Both ask who used legitimate access, and when |
| Lure and products | 4 Zero Chill (Attack Analyzer) | H19, H2, H13 | One person stays in the Attack Analyzer console |
| Web, LLM and floater | 1 Cats and Dawgs, 5 Threat Intel O'LLMa, 7 EGGS 10 | H18, H16, H6 | Custom data needing field extraction; Easter eggs between blocks |

### First 15 minutes

1. Run H0 and paste the sourcetype list into the shared notes.
2. Read every scenario's question titles once, then assign scenarios by the roles above.
3. Answer the introductory and 100-point questions immediately; they carry the speed bonus and reveal names, hosts and IPs.
4. Start the indicator list: users, hosts, IPs, domains, hashes, access keys, each with first-seen time.

### During the game

- **Bank easy points first.** In Tokyo v9, questions were worth 100, 500 or 1,500 points, with a bonus for answering before a hint unlocked.
- **Do not guess.** Wrong answers cost points there, so check the answer guidance (format, case, units, time zone) before submitting.
- **Time-box.** Ten minutes without progress means take the hint, swap with a teammate or move on; the Tokyo team's main regret was time sunk into hard questions.
- **Questions within a scenario chain.** Each answer is usually the search term for the next question, so solve them in order and narrow the time range as you go.
- **Share every indicator out loud.** The cloud case and the endpoint case are often the same intrusion seen from two sides.
- **Use OSINT when the data runs out.** If a question asks for something that cannot be in the logs (a malware family, a registrant, a second hash), it is an OSINT question.
- **Ask the coaches.** Splunk staffs events with coaches for when the hints run out; expect guidance on approach, not answers.

### Habits that save points

- All time first, then narrow. An empty result is usually the time picker.
- Use Verbose mode when exploring fields and Fast mode when counting.
- Start from a keyword, look at which sourcetypes hit, then switch to field searches.
- Copy answers from the event, never retype them; watch trailing dots, case and defanged formats.
- Easter egg questions reward reading the scenario text, dashboards and lookups closely, not hunting skill.

### Practice lab

STRT's [Attack Range v5](https://www.splunk.com/en_us/blog/security/splunk-attack-range-v5-security-lab-guide.html) and [TOTAL-REPLAY](https://www.splunk.com/en_us/blog/security/total-replay-splunk-attack-data-testing.html) replay real attack datasets into Splunk, which is the closest public substitute for the v10 data. I have not checked which datasets it ships for each post, so pick whatever endpoint and web datasets are available and run H2 to H6 and H11 against them.

## Sources

Pages opened for this sheet. The SPL and field names are from my own knowledge of the standard add-ons, not from these pages, and were not run against the v10 data.

- BOTS v10 and format: [Celebrate 10 Years of BOTS at .conf25](https://www.splunk.com/en_us/blog/conf-splunklive/celebrate-10-years-of-boss-of-the-soc-at-conf25.html), [2025 Worldwide BOTS Day](https://www.splunk.com/en_us/blog/security/2025-worldwide-bots-day.html), [GovSummit 2026 BOTS 10](https://www.splunk.com/en_us/blog/industries/boss-of-the-soc-splunk-govsummit.html), [2026 Higher Education BOTS winner](https://www.splunk.com/en_us/blog/industries/2026-national-higher-education-boss-of-the-soc-winner.html), [Demae-can v9 Tokyo report](https://techblog.demae-can.co.jp/entry/20251106/1762419255)
- Search results only, not opened in full: [Splunk Community BOTS10 post](https://community.splunk.com/t5/Community-Blog/Get-Ready-for-BOTS10-The-Legendary-Challenge-Returns-to-conf25/ba-p/750838), [EMEA BOTS 2026](https://discover.splunk.com/emea-bots.html), [SNHU BOTSv10 event](https://events.snhu.edu/en/boss-of-the-soc-bots-cybersecurity-and-data-analytics-competition-2026-5a3NQU1ou4r), [BOTS11 at .conf26](https://www.splunk.com/en_us/blog/conf-splunklive/boss-of-the-soc-conf26.html), [CAE competitions list](https://cyber-atlas.caecommunity.org/competitions), [October 2026 recap](https://www.splunk.com/en_us/blog/security/splunk-security-content-for-threat-detection-response-october-recap.html)
- STRT publications: [author index](https://www.splunk.com/en_us/blog/author/secmrkt-research.html) (pages 1 to 11, titles and teasers only; the individual posts were not read), plus the quarterly round-ups linked in the research section
- Preparation: [Hunting with Splunk: The Basics](https://www.splunk.com/blog/2017/07/06/hunting-with-splunk-the-basics.html), [SURGe](https://www.splunk.com/en_us/surge.html)

* Scenario briefs: the eight PDF exports of the Tokyo Regional BOTSv10 portal pages you attached on 11 November 2026 (scenario list and one page per scenario; questions and resources were empty)
