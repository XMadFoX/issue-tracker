import allure
from selenium.common.exceptions import NoSuchElementException, TimeoutException
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


class BasePage:
    def __init__(self, driver: WebDriver, base_url: str = "http://localhost:3000"):
        self.driver = driver
        self.base_url = base_url

    @allure.step("Navigate to URL path '{path}'")
    def navigate(self, path: str = ""):
        self.driver.get(f"{self.base_url}/{path}")

    @allure.step("Find element by locator '{locator}'")
    def find(self, locator, timeout=10):
        return WebDriverWait(self.driver, timeout).until(
            EC.visibility_of_element_located(locator),
            message=f"Element with locator '{locator}' was not visible within {timeout}s on page '{self.driver.current_url}'",
        )

    @allure.step("Type text into locator '{locator}'")
    def type(self, locator, text, timeout=10):
        element = WebDriverWait(self.driver, timeout).until(
            EC.visibility_of_element_located(locator),
            message=f"Element with locator '{locator}' was not visible for typing within {timeout}s on page '{self.driver.current_url}'",
        )
        element.send_keys(text)
        return element

    @allure.step("Click element '{locator}'")
    def click(self, locator, timeout=10):
        element = WebDriverWait(self.driver, timeout).until(
            EC.element_to_be_clickable(locator),
            message=f"Element with locator '{locator}' was not clickable within {timeout}s on page '{self.driver.current_url}'",
        )
        element.click()
        return element

    @allure.step("Get text from element '{locator}'")
    def get_text(self, locator, timeout=10):
        return (
            WebDriverWait(self.driver, timeout)
            .until(
                EC.visibility_of_element_located(locator),
                message=f"Element with locator '{locator}' was not visible to read text within {timeout}s on page '{self.driver.current_url}'",
            )
            .text
        )

    @allure.step("Check if element '{locator}' is present")
    def is_element_present(self, locator, timeout=10):
        try:
            WebDriverWait(self.driver, timeout).until(
                EC.presence_of_element_located(locator)
            )
            return True
        except (TimeoutException, NoSuchElementException):
            return False
