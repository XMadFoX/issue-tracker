import os
import allure
from allure_commons.types import AttachmentType
import pytest
from selenium import webdriver


@pytest.fixture(scope="session", autouse=True)
def purge_database():
    """Automatically purges user & auth tables from PostgreSQL before running tests."""
    db_url = os.getenv(
        "DATABASE_URL", "postgres://postgres:postgres@localhost:5432/issue_tracker"
    )
    try:
        import psycopg

        with psycopg.connect(db_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    'TRUNCATE TABLE "user", "session", "account", "verification" CASCADE;'
                )
            conn.commit()
    except Exception as e:
        print(f"\n[Warning] Could not purge database: {e}")


@pytest.fixture
def driver():
    options = webdriver.FirefoxOptions()
    if os.getenv("MOZ_HEADLESS", "0") in ("1", "true") or os.getenv(
        "HEADLESS", "0"
    ) in ("1", "true"):
        options.add_argument("--headless")
    options.add_argument("--width=1920")
    options.add_argument("--height=1080")

    driver = webdriver.Firefox(options=options)
    driver.set_window_size(1920, 1080)

    yield driver

    driver.quit()


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    rep = outcome.get_result()
    if rep.when == "call" and rep.failed:
        driver = item.funcargs.get("driver")
        if driver:
            allure.attach(
                driver.get_screenshot_as_png(),
                name="failure_screenshot",
                attachment_type=AttachmentType.PNG,
            )
