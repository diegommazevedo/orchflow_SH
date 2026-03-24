from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os
import sys

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")

if not DATABASE_URL:
    print("FATAL: DATABASE_URL não definida", file=sys.stderr)
    sys.exit(1)

# Railway entrega "postgres://" (libpq antigo); SQLAlchemy 2.0 exige "postgresql://"
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Railway PostgreSQL exige SSL — psycopg2 precisa do parâmetro explícito
_is_railway = "railway.app" in DATABASE_URL or "railway.internal" in DATABASE_URL
_connect_args = {"sslmode": "require"} if _is_railway else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=_connect_args,
    pool_pre_ping=True,       # detecta conexões mortas antes de usar
    pool_recycle=300,         # recicla conexões a cada 5 min (evita timeout Railway)
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
