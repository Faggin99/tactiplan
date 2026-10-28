package com.faggin.tactiplan.app.dados

import org.junit.Assert.assertEquals
import org.junit.Test

class ModoTemaTest {
    @Test fun `le a preferencia e cai no automatico`() {
        assertEquals(ModoTema.ESCURO, ModoTema.de("escuro"))
        assertEquals(ModoTema.CLARO, ModoTema.de("claro"))
        assertEquals(ModoTema.AUTOMATICO, ModoTema.de(null))
        assertEquals(ModoTema.AUTOMATICO, ModoTema.de("qualquer"))
        assertEquals(null, ModoTema.AUTOMATICO.escuroFixo())
        assertEquals(true, ModoTema.ESCURO.escuroFixo())
        assertEquals(false, ModoTema.CLARO.escuroFixo())
        assertEquals(listOf("Automático", "Claro", "Escuro"), ModoTema.entries.map { it.rotulo })
    }
}
