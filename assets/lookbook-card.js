if (!customElements.get('lookbook-card')) {
  customElements.define(
    'lookbook-card',
    class LookbookCard extends ModalComponent {
      constructor() {
        super();

        this.card = this.closest('.lbcard');
      }

      prepareToShow() {
        super.prepareToShow();

        this.card.classList.add('is-open');
      }

      handleAfterHide() {
        super.handleAfterHide();

        this.card.classList.remove('is-open');
      }
    }
  );
}
