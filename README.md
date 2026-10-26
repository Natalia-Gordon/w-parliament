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
‏`/healthz`, הפניות מכתובות WordPress, וסטטוס 404 אמיתי לכתובות לא מוכרות.

## פריסה ל-Cloud Run

פעם אחת לכל פרויקט:

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
gcloud artifacts repositories create web --repository-format=docker --location=me-west1
```

בנייה ופריסה (בעזרת `cloudbuild.yaml`):

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_REGION=me-west1,_SITE_URL=https://womenparliament.org,_CONTACT_FORM_ENDPOINT=https://formspree.io/f/XXXX
```

אפשר גם לפרוס ישירות מהקוד. במקרה הזה build args לא מועברים, ולכן חלים ערכי ברירת המחדל שב-Dockerfile:

```bash
gcloud run deploy women-parliament --source . --region me-west1 --allow-unauthenticated --port 8080 --memory 256Mi
```

לחיבור הדומיין מומלץ להשתמש ב-Global external Application Load Balancer עם serverless NEG, ואפשר להוסיף Cloud CDN.
‏Domain mapping של Cloud Run זמין רק בחלק מהאזורים.
