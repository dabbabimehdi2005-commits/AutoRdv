# AutoRendez

Application full-stack Flask + SQLite pour la prise de rendez-vous en garage.

## Demarrage

```powershell
python -m pip install -r requirements.txt
python app.py
```

Ouvrez http://127.0.0.1:5000/.

Mot de passe administrateur par defaut : `admin123`. Pour le modifier :

```powershell
$env:SECRET_KEY="une-cle-secrete-longue"
$env:ADMIN_PASSWORD="votre-mot-de-passe"
python app.py
```
