// Your username and display name. Everyone picks a username the first time
// they open the app signed in (`required`: the sheet can't be dismissed);
// after that it's Edit profile on the Profile page. Picking one is also where
// you agree to the terms, before anyone can see or add you.
import { AtSign } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, Row, Section, Sheet, Toggle } from "./kit";
import { cleanUsername, usernameProblem } from "@/lib/model.js";
import { notify } from "@/lib/notify";
import { social } from "@/lib/social.js";
import { sync } from "@/lib/sync.js";
import { useValue } from "@/lib/use-signal";

// A starting suggestion from the email: its first part, cleaned up.
function suggestion(email = "") {
  const base = email.split("@")[0].toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 20);
  return base.length >= 3 ? base : `${base}lifter`.slice(0, 20);
}

export function AccountSheet({ open, onClose, required = false }: { open: boolean; onClose: () => void; required?: boolean }) {
  const user = (useValue(sync) as any).user;
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  useEffect(() => {
    if (!open || !user) return;
    setUsername(user.username || suggestion(user.email));
    setName(user.name || "");
    setError("");
  }, [open]);

  const clean = cleanUsername(username);
  const problem = clean ? usernameProblem(clean) : "";
  const save = async () => {
    setBusy(true);
    try {
      const data = await social("/api/account", { username: clean, name });
      sync.value = { ...sync.value, user: data.user };
      notify(required ? `You're @${data.user.username}` : "Profile saved");
      onClose();
    } catch (failure: any) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={required ? () => {} : onClose} open={open} right={required ? null : undefined} title={required ? "Pick a username" : "Edit profile"}>
      {required ? <p className="px-1 text-[15px] text-muted-foreground">Friends find you by your username instead of your email. You can change it later in Profile.</p> : null}
      <Section footer={error || problem || "3–20 lowercase letters, numbers, _ or ."} title="Username">
        <Card>
          <label className="flex min-h-14 items-center gap-2 px-4">
            <AtSign className="size-[18px] shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <input
              aria-label="Username"
              autoCapitalize="none"
              autoComplete="username"
              autoCorrect="off"
              className="min-w-0 flex-1 bg-transparent text-[17px] outline-none"
              maxLength={21}
              onChange={(e) => {
                setUsername(e.currentTarget.value);
                setError("");
              }}
              spellCheck={false}
              value={username}
            />
          </label>
        </Card>
      </Section>
      <Section footer="What friends see next to your username. Leave it empty to show just the username." title="Display name">
        <Card>
          <input aria-label="Display name" className="min-h-14 w-full bg-transparent px-4 text-[17px] outline-none placeholder:text-muted-foreground" maxLength={40} onChange={(e) => setName(e.currentTarget.value)} placeholder="Your name" value={name} />
        </Card>
      </Section>
      {required ? (
        <Section footer="Lift has no tolerance for abusive content or behavior. You can report or block anyone, and accounts that break the terms are removed." title="Terms">
          <Card className="divide-y divide-border">
            <Row chevron href="/terms.html" title="Read the terms of use" />
            <Row title="I agree to the terms">
              <Toggle checked={agreed} label="I agree to the terms of use" onChange={setAgreed} />
            </Row>
          </Card>
        </Section>
      ) : null}
      <Card>
        <Row disabled={busy || !clean || Boolean(problem) || (required && !agreed)} onClick={save} title={busy ? "Saving…" : "Save"} tone="action" />
      </Card>
    </Sheet>
  );
}
