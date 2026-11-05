## 🏗️ Architecture & Flux de Données

L'application repose sur une architecture découplée associant un frontend/backend web moderne (**SvelteKit**) et un moteur de calcul d'itinéraire multimodal performant (**OpenTripPlanner 2.5**).

Pour contourner les contraintes de mémoire RAM lors de la phase de compilation du réseau (build du graphe), le processus est scindé entre une intégration continue sur **GitHub Actions** (chargée des traitements lourds) et un environnement local/production léger (mode chargement seul).

---

### 🧱 Composants du Projet

| Composant / Fichier | Rôle technique | Rôle fonctionnel |
| :--- | :--- | :--- |
| **`otp-data/graph.obj`** | Structure de données compilée (OSM + GTFS) | La carte mémoire pré-calculée de la région Centre-Val de Loire. |
| **`OTP (Port 8080)`** | Moteur de calcul de cheminement (Java) | Le calculateur d'itinéraires en arrière-plan. |
| **`src/lib/types/otp.ts`** | Interfaces TypeScript | Le contrat de données qui valide la structure JSON reçue d'OTP. |
| **`src/lib/server/otp.ts`** | Service d'appel HTTP (`fetch`) | Le connecteur qui formate et envoie la requête à OTP. |
| **`src/routes/api/route/+server.ts`** | Route API SvelteKit (`POST`) | La passerelle entre le navigateur et le serveur OTP. |

---

### 🔄 Flux de Données Global

Le schéma ci-dessous détaille le cycle de vie des données, depuis la compilation du graphe en CI jusqu'à l'affichage de l'itinéraire sur la carte :

```text
1. PHASE DE PRÉ-CALCUL (CI / GitHub Actions - Machine 16 Go RAM)
   [ OpenStreetMap (.pbf) ] + [ GTFS Filbleu & Rémi (.zip/.txt) ]
                                 │
                                 ▼
                     java -Xmx12g -jar otp.jar --build
                                 │
                                 ▼
                       [ otp-data/graph.obj ]  (Artefact généré)


2. PHASE D'EXÉCUTION (Environnement Local / Docker - RAM ~3.5 Go)
   ┌─────────────────────────────────────────────────────────┐
   │ 1. Navigateur (Client Svelte)                           │
   │    Utilisateur sélectionne départ/arrivée sur la carte  │
   └────────────────────────────┬────────────────────────────┘
                                │ POST /api/route (JSON)
                                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ 2. Serveur SvelteKit (Backend Node.js - :5173)          │
   │    Validation des requêtes et proxy vers le moteur      │
   └────────────────────────────┬────────────────────────────┘
                                │ GET /otp/routers/default/plan
                                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ 3. Instance OpenTripPlanner (Mode --load - :8080)       │
   │    Recherche de parcours via graph.obj en RAM           │
   └────────────────────────────┬────────────────────────────┘
                                │ Réponse JSON (Itinéraires, legs, polyline)
                                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ 4. Affichage Frontend                                   │
   │    Décodage de la géométrie et tracé Leaflet/MapLibre    │
   └─────────────────────────────────────────────────────────┘