# Setup SMTP + invito email — prerequisito per `inviteUserByEmail` (Opzione A)

> **Stato:** prerequisito infrastrutturale a carico di Vincenzo (pannello Supabase + DNS).
> **Non è codice.** È la checklist di configurazione da completare PRIMA che Claude Code
> implementi l'Opzione A (invito email: l'utente sceglie da sé la password al primo accesso).
>
> **Contesto:** oggi SafeCheck non ha alcun invio email configurato (nessun SMTP/Resend,
> nessun flusso "password dimenticata"; `creaUtente` usa `email_confirm:true`). L'attuale
> creazione utente con password temporanea mostrata all'admin (opzione b) **resta in uso**
> come soluzione temporanea finché A non è pronta. Questa checklist sblocca A.
>
> **Quando avrai completato e verificato i punti 1–4**, conferma a Claude Code: seguirà la
> sessione dedicata di implementazione (§6, solo codice).

---

## 1. Provider SMTP — Resend

Obiettivo: un SMTP affidabile e di produzione (l'SMTP di default di Supabase è
rate-limited ~2-4 email/ora ed è "solo per testing" → **non usarlo** per un cliente reale).

- [ ] **Account Resend** attivo (https://resend.com). Il piano free include l'invio SMTP.
- [ ] **Verifica del dominio mittente** in Resend → *Domains* → *Add Domain*.
  - Dominio consigliato: quello istituzionale dello studio (es. `studiobilello.it`),
    **non** `vercel.app` (non puoi aggiungere record DNS su un dominio Vercel condiviso).
  - Resend fornisce i record **DNS da inserire** presso il registrar/gestore DNS del dominio:
    - **SPF** (TXT): `v=spf1 include:_spf.resend.com ~all` (o merge con l'SPF esistente).
    - **DKIM** (TXT): record `resend._domainkey` (valore fornito da Resend).
    - *(opzionale ma consigliato)* **DMARC** (TXT su `_dmarc`): `v=DMARC1; p=none;`.
  - [ ] Attendere la **propagazione DNS** (da minuti a qualche ora) e il badge **Verified** in Resend.
- [ ] **API Key** Resend → *API Keys* → *Create* (scope: sending). **Copiala una volta** e
  conservala in un gestore di credenziali. Serve come **password SMTP** al punto 2.
  ⚠️ Non incollarla mai in chat né committarla nel repo.

**Parametri SMTP Resend** (da usare al punto 2):
| Campo | Valore |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` (SSL) — in alternativa `587` (STARTTLS) |
| Username | `resend` |
| Password | *la Resend API key* |
| Sender email | un indirizzo **sul dominio verificato**, es. `no-reply@studiobilello.it` |
| Sender name | `SafeCheck` (o `Studio Bilello — SafeCheck`) |

---

## 2. Supabase → Auth → SMTP Settings

Dashboard Supabase → progetto SafeCheck → **Authentication → Emails → SMTP Settings** (o
*Project Settings → Auth → SMTP*).

- [ ] **Enable Custom SMTP** = ON.
- [ ] Inserire Host / Port / Username / Password / Sender email / Sender name del punto 1.
- [ ] Salvare e usare **Send test email** (se disponibile) verso una tua casella → verifica
  ricezione (controlla anche Spam la prima volta).
- [ ] *(consigliato)* In **Auth → Rate limits**, verificare che il limite "email sent" sia
  adeguato (con SMTP custom il tetto default Supabase non si applica più allo stesso modo,
  ma controlla che non ci sia un limite troppo basso residuo).

---

## 3. Supabase → Auth → URL Configuration

Serve perché il link dell'invito (e di un eventuale reset) rimandino all'app giusta e
Supabase accetti il redirect.

- [ ] **Site URL** = URL di produzione dell'app: `https://safecheck-app-tau.vercel.app`
  *(o il dominio custom definitivo, se/quando configurato — in quel caso usare quello).*
- [ ] **Redirect URLs (allowlist)** — aggiungere le URL su cui l'utente atterra dopo il link:
  - `https://safecheck-app-tau.vercel.app/set-password`
  - `https://safecheck-app-tau.vercel.app/**` *(comodo per i preview/anteprime; opzionale)*
  - *(se userai un dominio custom, aggiungere anche le sue varianti)*

> Nota: la route `/set-password` **non esiste ancora** — la crea Claude Code nella sessione
> di implementazione (§6). L'allowlist va comunque predisposta ora con quel path.

---

## 4. Template email in italiano

Supabase → **Authentication → Emails → Templates**. Il flusso invito usa il template
**"Invite user"** (`{{ .ConfirmationURL }}` è il link sicuro monouso).

- [ ] Personalizzare **Invite user** in italiano. Bozza suggerita:
  - **Subject:** `Sei stato invitato su SafeCheck`
  - **Body (HTML):**
    ```html
    <h2>Benvenuto in SafeCheck</h2>
    <p>Sei stato invitato ad accedere a SafeCheck, la piattaforma per i sopralluoghi
    di sicurezza dello Studio Bilello.</p>
    <p>Per attivare il tuo account e <strong>scegliere la tua password</strong>,
    clicca sul pulsante qui sotto:</p>
    <p><a href="{{ .ConfirmationURL }}">Attiva il mio account</a></p>
    <p>Il link è personale e scade dopo un periodo limitato. Se non hai richiesto
    questo invito, ignora questa email.</p>
    ```
- [ ] *(consigliato, per completare il quadro)* Personalizzare in italiano anche
  **Reset password** e **Confirm signup**, così eventuali flussi futuri sono coerenti.
- [ ] Verificare che il template mittente coincida col Sender del punto 1 (nessun mismatch
  di dominio, per non finire in spam).

---

## 5. Verifica end-to-end (prima di dare l'OK a Claude Code)

- [ ] Da Resend *Logs* / Supabase *Auth logs*: un invio di test risulta **delivered**, non bounced.
- [ ] L'email di test **arriva** (inbox, non spam) con mittente `@dominio-verificato`.
- [ ] Il link nel template punta a `Site URL` corretto.

Quando questi tre check sono verdi → **conferma a Claude Code**: "SMTP pronto, procedi con A".

---

## 6. Cosa farà Claude Code DOPO la tua conferma (solo per riferimento — non è compito tuo)

Sessione dedicata, solo codice, nessuna migration prevista:
- Nuova route **`/set-password`**: pagina dove l'utente invitato atterra dal link, stabilisce
  la sessione dal token e imposta la propria password (`supabase.auth.updateUser({ password })`).
- Adattamento **`creaUtente`** (`src/lib/server/organizzazione.ts`): da `admin.auth.admin.createUser`
  a **`admin.auth.admin.inviteUserByEmail(email, { data: { nome_completo, ruolo }, redirectTo: '…/set-password' })`**;
  rimozione della generazione/ritorno della password temporanea per la creazione (l'utente la
  sceglie da sé). Il trigger `handle_new_user` (004) continua a creare la riga `utenti` dai
  metadata; resta l'allineamento profilo + cleanup.
- UI `/organizzazione`: il dialog "Aggiungi utente" mostra "Invito inviato a …" invece della
  password temporanea. **Reset password** resta come oggi (opzione b) o migra a
  `resetPasswordForEmail` — da decidere in quella sessione.
- Test asUser aggiornati + regressione + build.

> L'attuale opzione (b) resta operativa fino allo switch. La migrazione ad A è un mini-task
> a sé, non un blocco per la chiusura di Sprint 16.
