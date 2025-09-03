import os
from typing import List
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Server configuration
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = False
    WORKERS: int = 4
    
    # Security
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5000"]
    
    # Database
    MONGODB_URI: str = "mongodb://localhost:27017/satyashield"
    REDIS_URI: str = "redis://localhost:6379"
    
    # Model paths
    MODEL_BASE_PATH: str = "/app/data/models"
    DEEPFAKE_MODEL_PATH: str = f"{MODEL_BASE_PATH}/deepfake"
    FRAUD_MODEL_PATH: str = f"{MODEL_BASE_PATH}/fraud"
    NLP_MODEL_PATH: str = f"{MODEL_BASE_PATH}/nlp"
    CV_MODEL_PATH: str = f"{MODEL_BASE_PATH}/cv"
    
    # Processing limits
    MAX_FILE_SIZE: int = 100 * 1024 * 1024  # 100MB
    MAX_VIDEO_DURATION: int = 300  # 5 minutes
    MAX_BATCH_SIZE: int = 32
    
    # External APIs
    SEBI_API_URL: str = "https://www.sebi.gov.in/api"
    NSE_API_URL: str = "https://www.nseindia.com/api"
    BSE_API_URL: str = "https://api.bseindia.com"
    
    # Celery configuration
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"
    
    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    
    # MLflow
    MLFLOW_TRACKING_URI: str = "http://localhost:5000"
    MLFLOW_EXPERIMENT_NAME: str = "satyashield-fraud-detection"
    
    # Monitoring
    ENABLE_METRICS: bool = True
    METRICS_PORT: int = 9090
    
    # Cache settings
    CACHE_TTL: int = 3600  # 1 hour
    MODEL_CACHE_SIZE: int = 10
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
