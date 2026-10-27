# פרלמנט נשים – אתר Angular

האתר נבנה מתוך קובץ היצוא של WordPress (WXR) שבתיקייה `documents/`. בזמן הבנייה התוכן מומר ל-JSON,
וכל הדפים (כ-1,000) עוברים prerender ל-HTML סטטי באמצעות Angular 22. בפרודקשן האתר מוגש מ-nginx בתוך קונטיינר
ל-Google Cloud Run.

## דרישות

- Node.js בגרסה ‎22.22.3 ומעלה או ‎24.15 ומעלה (ראו `.nvmrc`)
- Docker, ו-`gcloud` לפריסה

## פיתוח מקומי

```bash
npm ci
npm start                # ממיר את ה-WXR ומריץ את שרת הפיתוח על http://localhost:4200
npm test                 # בדיקות יחידה (Vitest)
npm run build            # המרה + build עם prerender ל-dist/women-parliament/browser
```

### עדכון התוכן

1. מייצאים את האתר מ-WordPress (כלים ← ייצוא) ושומרים את קובץ ה-XML בתיקייה `documents/`. הקובץ החדש ביותר נבחר אוטומטית, או שמגדירים `WXR_FILE`.
2. `npm run content:import` – יוצר את `public/content/*.json`, את `sitemap.xml`, את `robots.txt` ואת מפת ההפניות של nginx.
3. `npm run media:download` – מוריד ל-`public/wp-content/uploads` תמונות וקובצי PDF חדשים מהאתר הישן. קבצים שכבר קיימים מדולגים.

את קובצי המדיה שבתיקייה `public/wp-content/uploads` יש לשמור במאגר, כי הם נכנסים לתמונת ה-Docker.

## מה הממיר עושה (`scripts/wxr-import.mjs`)

- פוסטים ודפים שפורסמו, עם הכותרת והדוברת (מתוך "כותרת | דוברת"), התגיות והקטגוריות.
- מסווג תגיות למושבים, לשנות פעילות, לדוברות ולנושאים.
- ממיר `wpautop`, גלריות `[gallery]`, קישורי YouTube וטופס Contact Form 7, ומנקה בלוקים של Gutenberg ו-HTML לא בטוח.
- ממיר קישורים פנימיים (`?p=123`, `/tag/...`, slugs) לנתיבים החדשים, ותמונות וקובצי PDF לנתיבים מקומיים.
- בונה את התפריט הראשי מתפריטי WordPress, עם תפריט "ארכיון" לדפים שלא היו בתפריט.
- יוצר הפניות 301 מכתובות ישנות: `?p=`, `?page_id=`, `?s=`, עמודי קבצים מצורפים ו-`/home`.

## Docker

```bash
docker build -t women-parliament --build-arg SITE_URL=https://womenparliament.org .
docker run --rm -p 8080:8080 women-parliament
# http://localhost:8080
```

| Build arg | תיאור |
|---|---|
| `SITE_URL` | הכתובת הציבורית, לקישורי canonical ול-sitemap |
| `CONTACT_FORM_ENDPOINT` | כתובת שמקבלת את טופס יצירת הקשר ב-POST JSON (למשל Formspree, Google Apps Script או Cloud Function). כשהערך ריק מוצגת הודעה במקום הטופס |

התמונה בנויה משני שלבים: Node 24 לבנייה, ו-`nginx-unprivileged` (שרץ כמשתמש שאינו root) בזמן ריצה, עם האזנה ל-`$PORT`.
תצורת nginx כוללת קבצים דחוסים מראש (gzip_static), cache ארוך לקבצים עם hash, כותרות אבטחה (CSP ו-HSTS),
‏`/health`, הפניות מכתובות WordPress, וסטטוס 404 אמיתי לכתובות לא מוכרות.

## פריסה ל-Cloud Run

הפרויקט: `shin-512818`. מאגר התמונות: `us-central1-docker.pkg.dev/shin-512818/w-parliament`. שירות Cloud Run: `w-parliament` באזור `us-central1` (https://w-parliament-1056654439816.us-central1.run.app).

**פריסה אוטומטית מ-GitHub:** כל push ל-`main` מריץ את `.github/workflows/google-cloudrun-docker.yml`, שבונה את התמונה, דוחף אותה ל-Artifact Registry ופורס ל-Cloud Run. ההגדרות שצריך לעשות פעם אחת (Workload Identity, הרשאות, משתני מאגר) מפורטות בראש הקובץ.

**פריסה ידנית** (בעזרת `cloudbuild.yaml`):

```bash
gcloud builds submit --config cloudbuild.yaml --project shin-512818 \
  --substitutions=_SITE_URL=https://womenparliament.org,_CONTACT_FORM_ENDPOINT=https://formspree.io/f/XXXX
```

**דחיפת תמונה מהמחשב המקומי:**

```bash
gcloud auth configure-docker us-central1-docker.pkg.dev
docker build -t us-central1-docker.pkg.dev/shin-512818/w-parliament/w-parliament:latest .
docker push us-central1-docker.pkg.dev/shin-512818/w-parliament/w-parliament:latest
```

לחיבור הדומיין: באזור `us-central1` אפשר להשתמש ב-Domain mapping של Cloud Run (בשלב Preview). לפרודקשן מומלץ Global external Application Load Balancer עם serverless NEG, ואפשר להוסיף Cloud CDN.
