# BOTS v10 write-up digest: Scenario 1, Cats and Dawgs

Digest of the one public BOTS v10 write-up found on 2026-11-13. This is a summary in my own words, not a copy of the original; read the source for screenshots and the author's full reasoning.

- Source: https://github.com/Uriarte12t/Cisco-Splunk-BOTS-V10-SOC-Investigation
- Author context: a student who played at Cal Poly Pomona on 2026-10-29
- Coverage: Scenario 1 only. No public write-up was found for scenarios 2 to 7.
- Limits: the author lists question titles and points but not the submitted answers, and left part of the investigation unresolved.

## Environment

| Item | Value |
| --- | --- |
| Index | `main` |
| Sourcetypes named | `tomcat:access:log`, `stream:http`, `auditd:laurel:syscall` |
| Other data mentioned | DNS events, Tomcat runtime logs, process execution activity |
| Web server | Apache Tomcat |
| Application | Hotdog Hustlers, at `frothlydawgs.com/hotdoghustlers/` |

## Questions the author answered

Six correct, 2,113 points in total. Point values include speed bonus, so they are not the base values.

| # | Title | Points scored |
| --- | --- | --- |
| 101 | The Foray Begins | 188 |
| 102 | I've Got a Game Name, Yes I Do! | 185 |
| 103 | We Are All Players | 440 |
| 104 | Some Are Bad Players | 445 |
| 106 | It's All About the Angle | 415 |
| 107 | The Files Are Inside the Computer | 440 |

Question 105 is missing from the author's list, so it was either skipped or answered wrong.

## Investigation path and findings

1. **Inventory the data.** A `tstats` count by index and sourcetype showed HTTP traffic, Tomcat logs and Linux audit events.
2. **Identify the web server.** The Tomcat access log identifies Apache Tomcat.
3. **Find the application.** Searching HTTP traffic for the game name gives the domain and path above. The author uses this as the baseline for normal play.
4. **Count players by country.** `iplocation` on source IPs, counting distinct IPs per country and not requests, because automated traffic inflates request volume. No countries are named in the write-up.
5. **Spot the bad player.** Source IP `185.211.32.18` requests unrelated paths in quick succession: `/robots.txt`, `/clientaccesspolicy.xml`, `/api/api-docs`, `/trace.axd`, `/crossdomain.xml`. The author reads this as automated reconnaissance or vulnerability probing, without proof of exploitation.
6. **Second address.** `18.201.29.183` performs `GET /index.jsp`, then `PUT /check.txt` (201 Created), then `GET /check.txt` (200 OK): a file written to the server and read back.
7. **Session cookie.** `JSESSIONID` appears in the traffic. The author notes that its presence alone does not show session hijacking.
8. **Server side.** `EXECVE` arguments from the Linux audit data show process execution, and the Tomcat logs contain exceptions related to Java session handling. The author did not resolve those exceptions during the game.

## SPL used by the author

```
| tstats count WHERE index=* BY index sourcetype
```

```
index=main sourcetype="tomcat:access:log" | head 20
```

```
index=main sourcetype="stream:http" "hotdoghustlers"
| table _time src_ip dest_ip site url uri_path
```

```
index=main sourcetype="stream:http" uri_path="/hotdoghustlers*"
| iplocation src_ip
| stats dc(src_ip) AS unique_players BY Country
| sort -unique_players
```

```
index=main sourcetype="stream:http" src_ip="185.211.32.18"
| sort 0 _time
| table _time src_ip http_method uri_path status
| head 40
```

```
index=main sourcetype="stream:http" "JSESSIONID"
| table _time src_ip http_method uri_path
| head 20
```

```
index=main sourcetype="auditd:laurel:syscall" "EXECVE"
| spath path=EXECVE.ARGV{} output=args
| eval command=mvjoin(args," ")
| table _time command
```

Fields used: `src_ip`, `dest_ip`, `site`, `url`, `uri_path`, `http_method`, `status`, `Country`, `EXECVE.ARGV{}`.

## My reading (not in the write-up)

The sequence of a writable-PUT test, `JSESSIONID` cookies and session-handling exceptions matches the Apache Tomcat partial-PUT deserialisation flaw, CVE-2025-24813: the attacker PUTs a serialised session file, then sends a request whose `JSESSIONID` points at that file so Tomcat deserialises it. This is an inference from the author's observations and is unverified against the game data.

Searches to test it:

```
index=main sourcetype=stream:http http_method=PUT
| table _time src_ip dest_ip uri_path status src_headers
```

```
index=main sourcetype=stream:http (cookie="*JSESSIONID=.*" OR src_headers="*JSESSIONID=.*" OR src_headers="*Content-Range*")
| sort 0 _time
| table _time src_ip http_method uri_path status cookie
```

```
index=main (sourcetype=tomcat* OR source=*catalina*) (Exception OR deserializ* OR "session" OR ObjectInputStream)
| sort 0 _time
| table _time sourcetype _raw
```

```
index=main sourcetype="auditd:laurel:syscall" EXECVE
| spath path=EXECVE.ARGV{} output=args
| eval command=mvjoin(args," ")
| sort 0 _time
| table _time host command
```

## What this tells us about the question style

- Titles 101 to 104 follow the investigation order: data inventory, application name, player population, bad actor. Expect the first questions to be orientation and to feed the later ones.
- "It's All About the Angle" (106) and "The Files Are Inside the Computer" (107) scored like the mid-value questions and probably concern the attack vector and the files written to the server.
- Counting distinct values and not events is a recurring trap; read whether a question asks for requests, IPs or users.
