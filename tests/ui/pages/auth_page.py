import allure
from ui.pages.base_page import BasePage
from selenium.webdriver.common.by import By


class AuthPage(BasePage):
    def __init__(self, driver):
        super().__init__(driver)
        self.email_input_locator = (By.ID, "email")
        self.name_input_locator = (By.ID, "name")
        self.password_input_locator = (By.ID, "password")
        self.submit_button_locator = (By.CSS_SELECTOR, "button[type='submit']")
        self.sign_in_button_locator = (
            By.XPATH,
            ("//button[text()='Sign in']"),
        )
        self.sign_up_button_locator = (
            By.XPATH,
            ("//button[text()='Sign up']"),
        )
        self.sign_in_text_locator = (
            By.XPATH,
            ('//div[contains(text(), "Don\'t have an account?")]'),
        )
        self.sign_up_text_locator = (
            By.XPATH,
            ("//div[contains(text(), 'Already have an account?')]"),
        )
        self.incorrect_credentials_locator = (
            By.XPATH,
            ("//div[contains(text(), 'Invalid email or password')]"),
        )
        # misc
        self.your_workspaces_locator = (
            By.XPATH,
            ("//h1[text()='Your Workspaces' or text()='Welcome to Prism']"),
        )

    @allure.step("sign-up form Render")
    def is_sign_up_form_rendered(self):
        return (
            self.is_element_present(self.name_input_locator)
            and self.is_element_present(self.email_input_locator)
            and self.is_element_present(self.password_input_locator)
        )

    @allure.step("sign-in form Render")
    def is_sign_in_form_rendered(self):
        return self.is_element_present(
            self.email_input_locator
        ) and self.is_element_present(self.password_input_locator)

    @allure.step("Navigate to authentication page")
    def navigate_to_login_page(self):
        self.navigate("auth")

    @allure.step("Sign up user with name '{name}', email '{email}'")
    def sign_up(self, name, email, password):
        self.click(self.sign_up_button_locator)  # page goes to sign in by default
        self.type(self.name_input_locator, name)
        self.type(self.email_input_locator, email)
        self.type(self.password_input_locator, password)
        self.click(self.submit_button_locator)

    @allure.step("Sign in user with email '{email}'")
    def sign_in(self, email, password):
        self.type(self.password_input_locator, password)
        self.type(self.email_input_locator, email)
        self.click(self.submit_button_locator)

    @allure.step("Switch to sign up form")
    def switch_to_sign_up_form(self):
        self.click(self.sign_up_button_locator)

    @allure.step("Switch to sign in form")
    def switch_to_sign_in_form(self):
        self.click(self.sign_in_button_locator)

    def is_workspaces_header_present(self):
        return self.is_element_present(self.your_workspaces_locator)

    def is_sign_up_text_present(self):
        return self.is_element_present(self.sign_up_text_locator)

    def is_sign_in_text_present(self):
        return self.is_element_present(self.sign_in_text_locator)
