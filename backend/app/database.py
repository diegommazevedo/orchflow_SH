from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os

load_dotenv()

# Railway entrega "postgres://" (libpq antigo); SQLAlchemy 2.0 exige "postgresql://"
DATABASE_URL = os.getenv("DATABASE_URL", "")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

_is_production = os.getenv("ENVIRONMENT", "development") == "production"
_engine_kwargs: dict = {
    "pool_pre_ping": True,
    "pool_recycle": 1800,  # recicla conexões a cada 30min
}
# SSL obrigatório em produção (Railway/Postgres exige)
if _is_production and DATABASE_URL.startswith("postgresql"):
    _engine_kwargs["connect_args"] = {"sslmode": "require"}

engine = create_engine(DATABASE_URL, **_engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
